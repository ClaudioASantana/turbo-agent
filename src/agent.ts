import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
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
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  consecutiveErrors: Annotation<number>({
    reducer: (x, y) => y, // Sobrescreve com o valor mais recente
    default: () => 0,
  }),
  finalAnswer: Annotation<string | null>({
    reducer: (x, y) => y,
    default: () => null,
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
    return messages.map(msg => {
      if (msg.role === "system") return new SystemMessage(msg.content);
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
      else if (msg instanceof ToolMessage) role = "user"; // Simulando o comportamento legado
      return { role, content: msg.content };
    });
  }

  private buildGraph() {
    // 1. Architect Node: Planejamento inicial
    const architectNode = async (state: typeof AgentState.State, config: any) => {
      const chat = new ChatOpenAI({
        modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
        temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
        maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
        openAIApiKey: process.env.OPENAI_API_KEY || "dummy",
        configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
      });
      
      // O Arquiteto recebe o contexto mas com uma diretriz específica
      const sysMsg = new SystemMessage("Você é o Arquiteto de Software. Analise o pedido do usuário e crie um plano técnico passo-a-passo (Spec) de no máximo 3 linhas para o Programador executar. NÃO responda ao usuário diretamente e NÃO use ferramentas, apenas planeje.");
      const response = await chat.invoke([sysMsg, ...state.messages], config);
      response.name = "architect";

      return { messages: [response] };
    };

    // 2. Coder Node: O LLM original que tem acesso às ferramentas
    const coderNode = async (state: typeof AgentState.State, config: any) => {
      try {
        const chat = new ChatOpenAI({
          modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
          temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
          maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
          openAIApiKey: process.env.OPENAI_API_KEY || "dummy",
          configuration: {
            baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1"
          }
        });

        const tools = ToolRegistry.getSchemas();
        const chatWithTools = chat.bindTools(tools);

        // O Coder recebe o plano do arquiteto como parte das messages
        const sysMsg = new SystemMessage("Você é o Programador (Coder). Siga rigorosamente o plano que o Arquiteto acabou de traçar na última mensagem. Use as ferramentas necessárias. Se terminar, use a ferramenta finish_task.");
        const response = await chatWithTools.invoke([sysMsg, ...state.messages], config);
        response.name = "coder";

        // Parser Híbrido: Se o modelo falhar na API nativa e cuspir texto puro
        if ((!response.tool_calls || response.tool_calls.length === 0) && response.content) {
            const extracted = extractToolCalls(response.content.toString());
            if (extracted && extracted.length > 0) {
               response.tool_calls = extracted;
            }
        }

        return { messages: [response] };
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
        openAIApiKey: process.env.OPENAI_API_KEY || "dummy",
        configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
      });
      
      const sysMsg = new SystemMessage(`Você é o Revisor de Qualidade (QA). O Coder declarou que finalizou a tarefa com a resposta: "${state.finalAnswer}". 
Se a tarefa parece cumprida, responda estritamente a palavra "APROVADO". 
Se faltou algo ou a resposta for ruim, aponte o defeito detalhadamente para o Coder corrigir.`);
      
      const response = await chat.invoke([sysMsg, ...state.messages], config);
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
          newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", content: "Task finished." }));
          continue;
        }

        if (!this.isSubagent) {
           console.log(pc.yellow(`\n🔧 Executando ferramenta nativa: ${toolName}`));
        }

        // Security
        const auth = await SecurityManager.authorize(toolName, args, this.isSubagent);
        if (!auth.approved) {
           newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", content: auth.userMessage }));
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
           newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", content: errorMsg }));
        } else {
           newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", content: resultString }));
        }
      }

      return { 
        messages: newMessages, 
        consecutiveErrors: currentErrors > 0 ? state.consecutiveErrors + 1 : 0,
        finalAnswer
      };
    };

    // Lógica de Roteamento (Edges)
    const routeFromCoder = (state: typeof AgentState.State) => {
      if (state.consecutiveErrors >= 3) return END; // Circuit Breaker
      
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      // Se ele chamou ferramentas, vai pro Node Tools
      if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        return "tools";
      }
      
      // Se ele não chamou ferramentas, ou ele bugou e retornou texto puro, ou ele chamou finish_task.
      // Em ambos os casos, a gente avalia se tem finalAnswer.
      if (state.finalAnswer) return "qaNode";
      return END; 
    };

    const routeFromQA = (state: typeof AgentState.State) => {
      // Se o QA anulou o finalAnswer, significa que ele reprovou e quer que o Coder refaça.
      if (!state.finalAnswer) return "coderNode";
      return END;
    };

    const workflow = new StateGraph(AgentState)
      .addNode("architectNode", architectNode)
      .addNode("coderNode", coderNode)
      .addNode("qaNode", qaNode)
      .addNode("tools", toolNode)
      
      .addEdge(START, "architectNode")
      .addEdge("architectNode", "coderNode")
      
      .addConditionalEdges("coderNode", routeFromCoder)
      .addEdge("tools", "coderNode")
      
      .addConditionalEdges("qaNode", routeFromQA);

    return workflow.compile({ checkpointer: this.checkpointer });
  }

  public async runStep(userPrompt: string): Promise<string | void> {
    const isJson = getConfig().logFormat === 'json';
    
    // Na primeira iteração da sessão, injetamos o system prompt legado.
    // O MemorySaver cuidará de não duplicar isso nas próximas rodadas.
    const stateSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
    const isFirstRun = !stateSnapshot?.values?.messages || stateSnapshot.values.messages.length === 0;

    let initialMessages: BaseMessage[] = [];
    if (isFirstRun) {
       initialMessages = this.mapToLangChainMessages(this.historyManager.messages);
    }
    initialMessages.push(new HumanMessage(userPrompt));

    // Prepara o estado inicial. Note que só passamos as mensagens NOVAS.
    let currentState: any = {
      messages: initialMessages,
      consecutiveErrors: 0,
      finalAnswer: null
    };

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
            if (!this.isSubagent && !isJson && chunk.content) {
               if (printedAgentHeader !== nodeName) {
                  let prefix = "🤖 Coder";
                  if (nodeName === "architect") prefix = "📐 Arquiteto";
                  if (nodeName === "qa") prefix = "🕵️ QA";
                  
                  process.stdout.write(pc.cyan(`\n\n${prefix} Raciocinando...\n`));
                  printedAgentHeader = nodeName;
               }
               process.stdout.write(pc.cyan(chunk.content));
            }
         } else if (event.event === "on_chain_end" && event.name === "LangGraph") {
            // Quando o Grafo termina completamente, ele devolve o estado final
            currentState = event.data.output;
         }
       }
       
       if (!this.isSubagent && !isJson) {
          process.stdout.write("\n\n");
       }
       
       const result = currentState;

       await DatadogDispatcher.flush();

       // Fase 2: O historyManager.ts foi desacoplado como backup!
       // A árvore de estado (messages) agora vive eternamente na memória do MemorySaver.
       // Mantemos a conversão para arquivo JSON apenas para compatibilidade legada e logs.
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
       return `Error: ${e.message}`;
    }
  }
}
