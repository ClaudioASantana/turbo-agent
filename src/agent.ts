import { buildSystemPrompt } from "./promptBuilder";
import { HistoryManager } from "./historyManager";
import { DatadogDispatcher } from "./datadog";
import { createAgentGraph } from "./graph/builder";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";
import { HumanMessage, SystemMessage, ToolMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import pc from "picocolors";
import { getConfig } from "./config";
import { Logger } from "./logger";
import { logAuditEvent } from "./audit";
import { checkInputGuardrails, formatGuardrailWarnings } from "./inputGuardrails";
import { createTracer, removeTracer, getTracer } from "./tracer";

export const agentEvents = new (require("events").EventEmitter)();

export class Agent {
  public historyManager: HistoryManager;
  private maxIterations: number;
  public isSubagent: boolean;
  public persona: string;
  private graph: any;
  private checkpointer: PostgresSaver;
  private threadId: string;
  private abortController: AbortController | null = null;
  public agentEvents: any;

  constructor(historyFilePath: string = ".agent_history.json", maxIterations?: number, maxMessages?: number, isSubagent = false, persona = "generic", threadId?: string, pool?: Pool) {
    const config = getConfig();
    this.maxIterations = maxIterations ?? config.maxIterations;
    const resolvedMaxMessages = maxMessages ?? config.maxMessages;
    this.isSubagent = isSubagent;
    this.persona = persona;
    
    this.historyManager = new HistoryManager(historyFilePath, resolvedMaxMessages);
    const initialPrompt = buildSystemPrompt(this.persona);
    this.historyManager.loadHistory(initialPrompt);
    
    if (!this.isSubagent) {
      logAuditEvent({ type: "agent_start", timestamp: new Date().toISOString() });
    }

    this.agentEvents = new (require("events").EventEmitter)();
    
    // Configura PostgresSaver via Pool
    if (!pool) {
      pool = new Pool({ connectionString: process.env.POSTGRES_URL || "postgres://agent_user:agent_password@localhost:5432/turbo_agent" });
    }
    this.checkpointer = new PostgresSaver(pool);
    // Nota: Em produção real, chamar pool.setup() em um init assíncrono seria ideal.
    // Aqui assumimos que as tabelas já foram criadas ou serão pelo primeiro run.

    this.threadId = threadId || `session_${Date.now()}`;
    this.graph = createAgentGraph(this.isSubagent, this.checkpointer);
  }

  // Permite inicializar o checkpointer async
  public async setupDatabase() {
    await this.checkpointer.setup();
  }

  // Métodos de histórico mantidos para compatibilidade
  public loadHistory() { this.historyManager.loadHistory(buildSystemPrompt(this.persona)); }
  public saveHistory() { this.historyManager.saveHistory(); }
  public clearHistory() { this.historyManager.clearHistory(buildSystemPrompt(this.persona)); }

  public async cancel() {
      if (this.abortController) {
          this.abortController.abort("Cancelled by user");
          this.abortController = null;
      }
      this.agentEvents.emit("system", "\n🚫 Operação cancelada pelo usuário.\n");
      this.agentEvents.emit("end");
  }

  // Helpers para converter histórico legado para LangChain Messages
  private mapToLangChainMessages(messages: any[]): BaseMessage[] {
    return messages
      .filter(msg => msg.role !== "system")
      .map(msg => {
        if (msg.role === "user") return new HumanMessage(msg.content);
        if (msg.role === "assistant") return new AIMessage(msg.content);
        return new HumanMessage(msg.content);
      });
  }

  private mapFromLangChainMessages(messages: BaseMessage[]): any[] {
    return messages.map(msg => {
      let role = "user";
      if (msg instanceof SystemMessage) role = "system";
      else if (msg instanceof AIMessage) role = "assistant";
      else if (msg instanceof ToolMessage) role = "user";

      let content = msg.content.toString();
      if (role === "assistant") {
         // Remove blocos <think>
         content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
         // Remove chamadas de ferramenta JSON bruto
         content = content.replace(/{\s*"tool"\s*:\s*"[^"]+"[\s\S]*}/g, "").trim();
         // Remove function tags
         content = content.replace(/<function=[^>]+>[\s\S]*?(?:<\/function>|})/g, "").trim();
      }

      return { role, content };
    });
  }

  public async abortPlan() {
    // Injeta mensagem de rejeição no estado para o Coder (se quisermos) ou apenas finaliza.
    // O mais simples é apenas limpar o estado.
    const stateSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
    await this.graph.updateState(
      { configurable: { thread_id: this.threadId } }, 
      { messages: [new HumanMessage("PLANO ABORTADO PELO USUÁRIO. Cancele a operação e chame finish_task.")] }
    );
    await this.runStep(null);
  }

  public async rewindState(steps: number): Promise<boolean> {
     const history: any[] = [];
     const historyIterator = await this.graph.getStateHistory({ configurable: { thread_id: this.threadId } });
     for await (const state of historyIterator) {
        history.push(state);
     }
     
     if (steps >= history.length || steps <= 0) {
        return false;
     }
     
     // history[0] é o atual, history[1] é 1 passo atrás
     const targetState = history[steps].values;
     
     // Fazemos um "Fork" criando uma nova thread limpa
     this.threadId = `session_${Date.now()}`;
     
     // Injeta todo o estado antigo na nova thread
     await this.graph.updateState(
        { configurable: { thread_id: this.threadId } },
        targetState
     );
     
     return true;
  }

  public async runStep(userPrompt: string | null): Promise<string | void | { status: 'paused' }> {
    const isJson = getConfig().logFormat === 'json';
    
    // Na primeira iteração da sessão, injetamos o system prompt legado.
    // O SqliteSaver cuidará de não duplicar isso nas próximas rodadas.
    const stateSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
    const isFirstRun = !stateSnapshot?.values?.messages || stateSnapshot.values.messages.length === 0;

    let initialMessages: BaseMessage[] = [];
    if (isFirstRun && userPrompt) {
       initialMessages = this.mapToLangChainMessages(this.historyManager.messages);
    }

    // Input Guardrails - Validate before processing
    if (userPrompt) {
      const guardrailResult = checkInputGuardrails(userPrompt);

      if (guardrailResult.blocked) {
        const errorMsg = guardrailResult.reason || "Entrada rejeitada por guardrails de segurança.";
        Logger.warn(`Input Guardrail Blocked: ${errorMsg}`);
        this.agentEvents.emit("error", errorMsg);
        await logAuditEvent({
          type: "input_guardrail_blocked",
          details: guardrailResult.reason,
          timestamp: new Date().toISOString()
        });
        return errorMsg;
      }

      if (guardrailResult.warnings && guardrailResult.warnings.length > 0) {
        const warningMsg = formatGuardrailWarnings(guardrailResult);
        Logger.info(`Input Guardrail Warning: ${guardrailResult.reason}`);
        this.agentEvents.emit("system", warningMsg);
        await logAuditEvent({
          type: "input_guardrail_warning",
          details: guardrailResult.warnings.join("; "),
          score: guardrailResult.score,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Slash Commands Interception
    if (userPrompt) {
        if (userPrompt.trim().startsWith("/goal ")) {
            this.maxIterations = 100; // Unlock iteration limits for Goal Mode
            userPrompt = userPrompt.replace(/^\/goal\s+/, "").trim() + "\n\n[SYSTEM: VOCÊ ESTÁ NO MODO /goal. Você NÃO DEVE PARAR de trabalhar até que toda a tarefa esteja concluída. Prossiga incansavelmente passo a passo.]";
            this.agentEvents.emit("system", "\n🎯 Modo /goal ATIVADO. Limites de iteração removidos.\n");
        } else if (userPrompt.trim().startsWith("/grill-me ")) {
            userPrompt = userPrompt.replace(/^\/grill-me\s+/, "").trim() + "\n\n[SYSTEM: VOCÊ ESTÁ NO MODO /grill-me. NÃO programe nada ainda! Faça perguntas interativas e detalhadas sobre a arquitetura, regras de negócio e requisitos do usuário para entender completamente o pedido antes de iniciar o plano. Entreviste o usuário!]";
            this.agentEvents.emit("system", "\n🔥 Modo /grill-me ATIVADO. O agente fará perguntas antes de programar.\n");
        }
    }

    if (userPrompt) {
      initialMessages.push(new HumanMessage(userPrompt));
    }

    // Prepara o estado inicial. Se for null (resumo), passamos null.
    let currentState: any = userPrompt ? {
      messages: initialMessages,
      consecutiveErrors: 0,
      finalAnswer: null,
      context: "",
      sender: "coderNode"
    } : null;

    this.abortController = new AbortController();
    const tracer = createTracer(this.threadId);
    let currentNodeSpanId: string | undefined;

    try {
       // Executa o grafo com persistência nativa (thread_id)
       const events = this.graph.streamEvents(currentState, {
         version: "v2",
         recursionLimit: this.maxIterations,
         configurable: { thread_id: this.threadId },
         signal: this.abortController.signal
       });

       let printedAgentHeader: string | boolean = false;
       const streamedTokensCount: Record<string, number> = {};
       let emittedAnyToken = false;

       let totalPromptTokens = 0;
       let totalCompletionTokens = 0;

       for await (const event of events) {
         // Trace: Node execution started
         if (event.event === "on_chain_start" && event.name !== "LangGraph") {
           const nodeName = event.metadata?.langgraph_node || event.name;
           currentNodeSpanId = tracer.startSpan(nodeName, undefined, {
             input: event.data?.input ? JSON.stringify(event.data.input).slice(0, 200) : undefined,
           });
         }

         if (event.event === "on_chat_model_stream") {
            const chunk = event.data.chunk;
            const nodeName = chunk.name || "agent"; // architect, coder ou qa

            // Apenas imprime conteúdo textual, ignora tool_calls no terminal para não poluir
            if (!this.isSubagent && !isJson && printedAgentHeader !== nodeName) {
               const displayName = nodeName === "architect" ? "📐 Arquiteto" : (nodeName === "explorer" ? "🔎 Explorador" : "🤖 Coder");
               process.stdout.write(pc.green(`\n\n${displayName} Raciocinando...\n`));
               this.agentEvents.emit("system", `\n\n${displayName} Raciocinando...\n`);
               printedAgentHeader = nodeName;
            }
            if (chunk.content) {
               const text = typeof chunk.content === 'string' ? chunk.content : (Array.isArray(chunk.content) ? chunk.content.map((c:any) => c.text || '').join('') : JSON.stringify(chunk.content));
               if (text) {
                   if (!this.isSubagent) {
                       process.stdout.write(pc.cyan(text));
                       this.agentEvents.emit("token", text);
                   }
                   emittedAnyToken = true;
                   streamedTokensCount[event.run_id] = (streamedTokensCount[event.run_id] || 0) + 1;
                }
            }
         } else if (event.event === "on_chat_model_end") {
            const msg = event.data.output;

            // Token tracking and tracing
            if (msg) {
                const usage = msg.usage_metadata || (msg.response_metadata && msg.response_metadata.tokenUsage) || (msg.response_metadata && msg.response_metadata.estimatedTokenUsage);
                if (usage) {
                    totalPromptTokens += usage.input_tokens || usage.promptTokens || 0;
                    totalCompletionTokens += usage.output_tokens || usage.completionTokens || 0;

                    // Update trace span with token info
                    if (currentNodeSpanId) {
                      tracer.endSpan(currentNodeSpanId, {
                        tokens: {
                          input: usage.input_tokens || usage.promptTokens || 0,
                          output: usage.output_tokens || usage.completionTokens || 0,
                        },
                      });
                      currentNodeSpanId = undefined;
                    }
                }
            }

            if (!streamedTokensCount[event.run_id] && msg && msg.content) {
               const nodeName = msg.name || "agent";
               if (!this.isSubagent && !isJson && printedAgentHeader !== nodeName) {
                  const displayName = nodeName === "architect" ? "📐 Arquiteto" : (nodeName === "explorer" ? "🔎 Explorador" : "🤖 Coder");
                  process.stdout.write(pc.green(`\n\n${displayName} Raciocinando...\n`));
                  agentEvents.emit("system", `\n\n${displayName} Raciocinando...\n`);
                  printedAgentHeader = nodeName;
               }
               const text = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.map((c:any) => c.text || '').join('') : JSON.stringify(msg.content));
               if (text) {
                   if (!this.isSubagent) {
                       process.stdout.write(pc.cyan(text));
                       agentEvents.emit("token", text);
                   }
                   emittedAnyToken = true;
               }
            }
         } else if (event.event === "on_tool_start") {
            if (!this.isSubagent && !isJson) {
               const toolName = event.name;
               process.stdout.write(pc.yellow(`\n[🔄 Executando ferramenta: ${toolName}...]\n`));
               agentEvents.emit("tool_start", toolName);
            }
            // Start tool span
            const toolSpanId = tracer.startSpan("tool", event.name, {
              input: event.data?.input ? JSON.stringify(event.data.input).slice(0, 200) : undefined,
            });
            (event as any).__tracerSpanId = toolSpanId;

         } else if (event.event === "on_tool_end") {
            if (!this.isSubagent && !isJson) {
               process.stdout.write(pc.green(`[✅ Ferramenta concluída]\n`));
               agentEvents.emit("tool_end");
            }
            // End tool span (if there's an associated span from on_tool_start)
            if ((event as any).__tracerSpanId) {
              tracer.endSpan((event as any).__tracerSpanId);
            }
         } else if (event.event === "on_chain_end" && event.name === "LangGraph") {
            currentState = event.data.output;
         }
       }
       
       if (!this.isSubagent && !isJson) {
          process.stdout.write("\n\n");
       }

       const finalSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
       if (finalSnapshot.next && finalSnapshot.next.length > 0) {
          agentEvents.emit("pause");
          return { status: 'paused' };
       }
       
       // Fallback blindado: Se NENHUM token chegou na UI (por bug de stream do proxy), pegamos a resposta final à força
       if (!emittedAnyToken && currentState && currentState.messages && currentState.messages.length > 0) {
           const lastMsg = currentState.messages[currentState.messages.length - 1];
           if ((lastMsg._getType() === "ai" || lastMsg.name === "explorer" || lastMsg.name === "coder") && lastMsg.content) {
               const text = typeof lastMsg.content === 'string' ? lastMsg.content : (Array.isArray(lastMsg.content) ? lastMsg.content.map((c:any) => c.text || '').join('') : JSON.stringify(lastMsg.content));
               if (text) {
                   process.stdout.write(pc.cyan(text));
                   agentEvents.emit("token", text);
               }
           }
       }
       
       agentEvents.emit("end");
       const result = currentState;

       // Flush trace metrics and generate report
       await tracer.flush();
       const traceReport = tracer.generateReport();
       if (!this.isSubagent && !isJson) {
         process.stdout.write(pc.dim(traceReport));
         agentEvents.emit("trace_report", traceReport);
       }

       await DatadogDispatcher.flush();

       if (!this.isSubagent && !isJson && (totalPromptTokens > 0 || totalCompletionTokens > 0)) {
           const tokenMsg = `\n📊 Tokens consumidos no ciclo: [Input: ${totalPromptTokens} | Output: ${totalCompletionTokens} | Total: ${totalPromptTokens + totalCompletionTokens}]\n`;
           process.stdout.write(pc.magenta(tokenMsg));
           agentEvents.emit("system", tokenMsg);
       }

       try {
         const finalSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
         if (finalSnapshot?.values?.messages) {
            this.historyManager.messages = this.mapFromLangChainMessages(finalSnapshot.values.messages);
            this.historyManager.saveHistory();
         }
       } catch (e: any) {
         Logger.warn("Erro ao fazer backup legado do histórico: " + e.message);
       }

       if (result.consecutiveErrors >= 3) {
          console.log(pc.red("\n[Circuit Breaker] Abortando execução por falhas repetidas."));
          return "Erro crítico: O agente falhou 3 vezes consecutivas e o Circuit Breaker foi ativado.";
       }

       let finalMsg = result.finalAnswer;
       if (!finalMsg && result.messages && result.messages.length > 0) {
           const lastMsg = result.messages[result.messages.length - 1];
           if (lastMsg._getType() === "ai" || lastMsg.name === "explorer" || lastMsg.name === "coder") {
               finalMsg = typeof lastMsg.content === 'string' ? lastMsg.content : (Array.isArray(lastMsg.content) ? lastMsg.content.map((c:any) => c.text || '').join('') : JSON.stringify(lastMsg.content));
           }
       }

       return finalMsg || "Execução concluída sem resposta final definida.";

    } catch (e: any) {
       if (e.name === "AbortError" || (e.message && e.message.includes("Cancelled by user"))) {
           Logger.warn("Execução cancelada pelo usuário.");
           await tracer.flush();
           removeTracer(this.threadId);
           return "Operação cancelada.";
       }
       Logger.error(`Erro crítico no LangGraph: ${e.message}`);
       agentEvents.emit("error", `Erro crítico na API do LLM: ${e.message}`);
       await tracer.flush();
       removeTracer(this.threadId);
       return `Error: ${e.message}`;
    } finally {
       // Cleanup tracer if still in memory
       if (getTracer(this.threadId)) {
         removeTracer(this.threadId);
       }
    }
  }
}
