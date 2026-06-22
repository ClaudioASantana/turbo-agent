import { StateGraph, START, END, Annotation, Send, messagesStateReducer } from "@langchain/langgraph";
import { EventEmitter } from "events";
export const agentEvents = new EventEmitter();
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ToolRegistry, ErrorCategory } from "./tools";
import pc from "picocolors";
import ora from "ora";
import { getConfig } from "./config";
import { Logger } from "./logger";
import { auditToolCall, auditToolResult, logAuditEvent } from "./audit";
import { buildSystemPrompt } from "./promptBuilder";
import { HistoryManager } from "./historyManager";
import { SecurityManager } from "./securityManager";
import { DatadogDispatcher } from "./datadog";
import { extractToolCalls } from "./parser";
import { CoreMemory } from "./coreMemory";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

// Função auxiliar para evitar erros da API do Claude agrupando mensagens consecutivas do mesmo papel
const normalizeMessages = (msgs: BaseMessage[]) => {
   const normalized: BaseMessage[] = [];
   for (let msg of msgs) {
       console.log("[DEBUG] Checking msg:", typeof msg._getType === "function" ? msg._getType() : "no-getType", msg.constructor?.name);
       
       // Se o proxy retornou ChatMessageChunk (sem role definida explicitamente), forçamos para AIMessage
       if (msg._getType() === "chat" || msg._getType() === "chat_chunk" || msg._getType() === "generic" || (msg.constructor && msg.constructor.name && msg.constructor.name.includes("ChatMessage"))) {
           console.log("[DEBUG] CONVERTING ChatMessageChunk TO AIMessage!");
           msg = new AIMessage({
               content: msg.content,
               additional_kwargs: msg.additional_kwargs,
               response_metadata: msg.response_metadata,
               id: msg.id
           });
       }
       
       if (normalized.length > 0 && normalized[normalized.length - 1]._getType() === msg._getType()) {
           const prev = normalized[normalized.length - 1];
           prev.content = prev.content.toString() + "\n\n" + msg.content.toString();
       } else {
           normalized.push(msg);
       }
   }
   
   // Anthropic exige que a primeira mensagem não-sistema seja do usuário.
   // Se o histórico corrompido ou compactado começar com AI, injetamos um HumanMessage dummy.
   if (normalized.length > 0 && normalized[0]._getType() === "ai") {
       normalized.unshift(new HumanMessage("Continuando o contexto anterior da sessão..."));
   }
   
   return normalized;
};

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  consecutiveErrors: Annotation<number>({
    reducer: (x, y) => y, // Sobrescreve com o valor mais recente
    default: () => 0,
  }),
  finalAnswer: Annotation<string | null>({
    reducer: (x, y) => y,
    default: () => null,
  }),
  context: Annotation<string>({
    reducer: (x, y) => y,
    default: () => "",
  }),
  sender: Annotation<string>({
    reducer: (x, y) => y,
    default: () => "coderNode",
  })
});

export class Agent {
  public historyManager: HistoryManager;
  private maxIterations: number;
  public isSubagent: boolean;
  public persona: string;
  private graph: any;
  private checkpointer: SqliteSaver;
  private threadId: string;

  constructor(historyFilePath: string = ".agent_history.json", maxIterations?: number, maxMessages?: number, isSubagent = false, persona = "generic") {
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

    this.checkpointer = SqliteSaver.fromConnString(".langgraph_memory.db");
    this.threadId = `session_${Date.now()}`;
    this.graph = this.buildGraph();
  }

  // Métodos de histórico mantidos para compatibilidade
  public loadHistory() { this.historyManager.loadHistory(buildSystemPrompt(this.persona)); }
  public saveHistory() { this.historyManager.saveHistory(); }
  public clearHistory() { this.historyManager.clearHistory(buildSystemPrompt(this.persona)); }

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

  private buildGraph() {
    // 0. Explorer Node: Mapeia o repositório (Agentic RAG)
    const explorerNode = async (state: typeof AgentState.State, config: any) => {
      // Se ele já finalizou a exploração
      if (state.finalAnswer && state.sender === "explorerNode") {
         return { context: state.finalAnswer, finalAnswer: null, sender: "architectNode" };
      }

      const chat = new ChatOpenAI({
        modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
        temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
        maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
        apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
        streamUsage: false,
        configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
      });

      const tools = ToolRegistry.getSchemas();
      const chatWithTools = chat.bindTools(tools);
      
      const sysMsg = new SystemMessage(`Você é o Explorador (Agentic RAG). Entenda o pedido do usuário e vasculhe os arquivos usando list_files ou read_file para encontrar onde a mudança deve ocorrer. Quando tiver os caminhos exatos, chame finish_task reportando os caminhos encontrados.
SE O USUÁRIO APENAS MANDAR UMA SAUDAÇÃO (ex: "olá"), responda amigavelmente em texto puro e NÃO chame ferramentas.
SE O USUÁRIO FIZER UMA PERGUNTA QUE EXIGE DADOS DA INTERNET (ex: clima, notícias, cotações), VOCÊ ESTÁ ESTRITAMENTE PROIBIDO de dizer que não tem acesso. VOCÊ DEVE OBRIGATORIAMENTE chamar a ferramenta "web_search" ou "invoke_browser_subagent" para buscar a resposta no Google/DuckDuckGo antes de responder.`);
      const cleanMessages = normalizeMessages(state.messages.filter((m: any) => m._getType() !== "system"));
      console.log("PAYLOAD MESSAGES TO LLM:", JSON.stringify([sysMsg, ...cleanMessages]));
      const response = await chatWithTools.invoke([sysMsg, ...cleanMessages], config);
      response.name = "explorer";

      if ((!response.tool_calls || response.tool_calls.length === 0) && response.content) {
          const extracted = extractToolCalls(response.content.toString());
          if (extracted && extracted.length > 0) response.tool_calls = extracted;
      }

      return { messages: [response], sender: "explorerNode" };
    };

    // 1. Architect Node: Planejamento inicial
    const architectNode = async (state: typeof AgentState.State, config: any) => {
      const chat = new ChatOpenAI({
        modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
        temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
        maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
        apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
        configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
      });
      
      const memoryRules = CoreMemory.getRules();
      const coreRulesText = memoryRules.length > 0 ? `\nRegras Permanentes a Respeitar:\n- ${memoryRules.join('\n- ')}` : '';

      const sysMsg = new SystemMessage(`Você é o Arquiteto de Software. 
Contexto encontrado pelo explorador sobre o repositório: ${state.context || 'Nenhum'}.${coreRulesText}
Crie um plano técnico passo-a-passo (Spec) para o Programador executar. NÃO use ferramentas. Formate explicitamente cada passo começando com "Passo 1:", "Passo 2:", etc.`);
      
      const cleanMessages = state.messages.filter(m => m._getType() !== "system");
      console.log("INVOKING CHAT WITH:", JSON.stringify([sysMsg, ...cleanMessages])); const response = await chat.invoke([sysMsg, ...cleanMessages], config);
      response.name = "architect";

      return { messages: [response], sender: "architectNode" };
    };

    // 2. Coder Node: O LLM original que tem acesso às ferramentas
    const coderNode = async (state: typeof AgentState.State, config: any) => {
      try {
        const chat = new ChatOpenAI({
          modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
          temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
          maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
          apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
        streamUsage: false,
          configuration: {
            baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1"
          }
        });

        const tools = ToolRegistry.getSchemas();
        const chatWithTools = chat.bindTools(tools);

        // O Coder recebe o plano do arquiteto como parte das messages
        const sysMsg = new SystemMessage("Você é o Programador (Coder). Siga rigorosamente o plano que o Arquiteto acabou de traçar na última mensagem. Use as ferramentas necessárias. Se terminar, use a ferramenta finish_task.");
        const cleanMessages = state.messages.filter(m => m._getType() !== "system");
        console.log("INVOKING CHATWITHTOOLS WITH:", JSON.stringify([sysMsg, ...cleanMessages])); console.log("PAYLOAD MESSAGES:", JSON.stringify([sysMsg, ...cleanMessages])); console.log("PAYLOAD MESSAGES TO LLM:", JSON.stringify([sysMsg, ...cleanMessages]));
      const response = await chatWithTools.invoke([sysMsg, ...cleanMessages], config);
        response.name = "coder";

        // Parser Híbrido: Se o modelo falhar na API nativa e cuspir texto puro
        if ((!response.tool_calls || response.tool_calls.length === 0) && response.content) {
            const extracted = extractToolCalls(response.content.toString());
            if (extracted && extracted.length > 0) {
               response.tool_calls = extracted;
            }
        }

        return { messages: [response], sender: "coderNode" };
      } catch (error: any) {
        Logger.error(`Erro na API do LLM (Coder): ${error.message}`);
        return { 
          messages: [new HumanMessage(`Erro de API ao chamar o modelo: ${error.message}. Verifique a conexão.`)],
          consecutiveErrors: state.consecutiveErrors + 1
        };
      }
    };

    // 3. QA Node: Avalia a resposta antes de enviar ao usuário
    const qaNode = async (state: typeof AgentState.State, config: any) => {
      // QA só age se o Coder disse que acabou
      if (!state.finalAnswer) return { messages: [] };

      const chat = new ChatOpenAI({
        modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
        temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
        maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
        apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
        configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
      });
      
      const sysMsg = new SystemMessage(`Você é o Revisor de Qualidade (QA). O Coder declarou que finalizou a tarefa com a resposta: "${state.finalAnswer}". 
Se a tarefa parece cumprida, responda estritamente a palavra "APROVADO". 
Se faltou algo ou a resposta for ruim, aponte o defeito detalhadamente para o Coder corrigir.`);
      
      const cleanMessages = state.messages.filter(m => m._getType() !== "system");
      console.log("INVOKING CHAT WITH:", JSON.stringify([sysMsg, ...cleanMessages])); const response = await chat.invoke([sysMsg, ...cleanMessages], config);
      response.name = "qa";

      if (response.content.toString().includes("APROVADO")) {
         return { messages: [response] };
      } else {
         // Reabre a tarefa para o Coder consertar
         return { messages: [response], finalAnswer: null }; 
      }
    };

    // Tool Node: Executa a ferramenta e faz o Self-Healing
    const toolNode = async (state: typeof AgentState.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      const toolCalls = lastMessage.tool_calls || [];
      const newMessages: BaseMessage[] = [];
      let currentErrors = 0;
      let finalAnswer: string | null = null;

      for (const call of toolCalls) {
        const toolName = call.name;
        const args = call.args;

        if (toolName === "finish_task") {
          finalAnswer = args.finalAnswer || 'Concluído';
          if (!this.isSubagent) {
             console.log(pc.green(`\n🤖 Turbo-Agent Finalizou:\n${finalAnswer}\n`));
          }
          newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: "Task finished." }));
          continue;
        }

        if (!this.isSubagent) {
           console.log(pc.yellow(`\n🔧 Executando ferramenta nativa: ${toolName}`));
        }

        // Security
        const auth = await SecurityManager.authorize(toolName, args, this.isSubagent);
        if (!auth.approved) {
           newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: auth.userMessage }));
           currentErrors++;
           continue;
        }

        auditToolCall(toolName, args);
        let toolResult = await ToolRegistry.execute(toolName, args);

        // Self-Healing TypeScript
        const writeTools = ["write_file", "replace_in_file", "patch_file", "multi_replace_in_file"];
        if (toolResult.success && writeTools.includes(toolName)) {
           try {
             await execAsync("npx tsc --noEmit");
           } catch (e: any) {
             toolResult.success = false;
             toolResult.category = ErrorCategory.EXECUTION;
             toolResult.error = `O arquivo foi salvo, mas a compilação falhou:\n${e.stdout || e.message}`;
           }
        }

        auditToolResult(toolName, JSON.stringify(toolResult));

        let resultString = JSON.stringify(toolResult);
        if (resultString.length > 3000) {
           resultString = resultString.substring(0, 3000) + "\n... [Saída truncada]";
        }

        if (!toolResult.success) {
           currentErrors++;
           const errorMsg = `Tool failed:\n${resultString}\n\n[SELF-HEALING]: Analise o erro, corrija os argumentos e tente novamente. Tentativa ${state.consecutiveErrors + 1} de 3.`;
           newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: errorMsg }));
        } else {
           newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: resultString }));
        }
      }

      return { 
        messages: newMessages, 
        consecutiveErrors: currentErrors > 0 ? state.consecutiveErrors + 1 : 0,
        finalAnswer
      };
    };

    // Lógica de Roteamento (Edges)
    const routeFromExplorer = (state: typeof AgentState.State) => {
      // Se chamou ferramenta (ex: list_files)
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) return "tools";
      
      // Se terminou de explorar (reportou finalAnswer via finish_task)
      if (state.context) return "architectNode";
      return END; // Se for apenas uma conversa direta sem ferramentas, encerra o ciclo.
    };

    const routeFromArchitect = (state: typeof AgentState.State) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const content = lastMessage.content.toString();
      
      // Quebra o plano em passos paralelos se o LLM seguiu a formatação
      const plans = content.split(/Passo \d+:/i).filter(p => p.trim().length > 10);
      
      if (plans.length > 1) {
         // Paralelismo agressivo: Cria um nó Coder independente para cada Passo!
         return plans.map(plan => new Send("coderNode", { 
           messages: [new SystemMessage("TAREFA ISOLADA. Siga este plano: " + plan)], 
           sender: "coderNode" 
         }));
      }
      return "coderNode";
    };

    const routeFromCoder = (state: typeof AgentState.State) => {
      if (state.consecutiveErrors >= 3) return END; // Circuit Breaker
      
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      // Se ele chamou ferramentas, vai pro Node Tools
      if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) return "tools";
      
      if (state.finalAnswer) return "qaNode";
      return END; 
    };

    const routeFromTools = (state: typeof AgentState.State) => {
      // Retorna a execução para quem chamou a ferramenta (Explorer ou Coder)
      return state.sender === "explorerNode" ? "explorerNode" : "coderNode";
    };

    const routeFromQA = (state: typeof AgentState.State) => {
      // Se o QA anulou o finalAnswer, significa que ele reprovou e quer que o Coder refaça.
      if (!state.finalAnswer) return "coderNode";
      return END;
    };

    const workflow = new StateGraph(AgentState)
      .addNode("explorerNode", explorerNode)
      .addNode("architectNode", architectNode)
      .addNode("coderNode", coderNode)
      .addNode("qaNode", qaNode)
      .addNode("tools", toolNode)
      
      .addEdge(START, "explorerNode")
      
      .addConditionalEdges("explorerNode", routeFromExplorer)
      .addConditionalEdges("architectNode", routeFromArchitect)
      
      .addConditionalEdges("coderNode", routeFromCoder)
      .addConditionalEdges("tools", routeFromTools)
      
      .addConditionalEdges("qaNode", routeFromQA);

    return workflow.compile({ 
      checkpointer: this.checkpointer,
      interruptBefore: ["coderNode"]
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

    try {
       // Executa o grafo com persistência nativa (thread_id)
       const events = this.graph.streamEvents(currentState, { 
         version: "v2", 
         recursionLimit: this.maxIterations,
         configurable: { thread_id: this.threadId }
       });

       let printedAgentHeader = false;

       for await (const event of events) {
         if (event.event === "on_chat_model_stream") {
            const chunk = event.data.chunk;
            const nodeName = chunk.name || "agent"; // architect, coder ou qa
            
            // Apenas imprime conteúdo textual, ignora tool_calls no terminal para não poluir
            if (!this.isSubagent && !isJson && printedAgentHeader !== nodeName) {
               const displayName = nodeName === "architect" ? "📐 Arquiteto" : (nodeName === "explorer" ? "🔎 Explorador" : "🤖 Coder");
               process.stdout.write(pc.green(`\n\n${displayName} Raciocinando...\n`));
               agentEvents.emit("system", `\n\n${displayName} Raciocinando...\n`);
               printedAgentHeader = nodeName;
            }
            if (chunk.content) {
               process.stdout.write(pc.cyan(chunk.content));
               agentEvents.emit("token", chunk.content);
            }
         } else if (event.event === "on_tool_start") {
            if (!this.isSubagent && !isJson) {
               const toolName = event.name;
               process.stdout.write(pc.yellow(`\n[🔄 Executando ferramenta: ${toolName}...]\n`));
               agentEvents.emit("tool_start", toolName);
            }
         } else if (event.event === "on_tool_end") {
            if (!this.isSubagent && !isJson) {
               process.stdout.write(pc.green(`[✅ Ferramenta concluída]\n`));
               agentEvents.emit("tool_end");
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
       
       agentEvents.emit("end");
       const result = currentState;
       await DatadogDispatcher.flush();

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

       return result.finalAnswer || "Execução concluída sem resposta final definida.";

    } catch (e: any) {
       Logger.error(`Erro crítico no LangGraph: ${e.message}`);
       agentEvents.emit("error", `Erro crítico na API do LLM: ${e.message}`);
       return `Error: ${e.message}`;
    }
  }
}
