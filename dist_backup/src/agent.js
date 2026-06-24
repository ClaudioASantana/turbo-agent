"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Agent = exports.agentEvents = void 0;
const langgraph_1 = require("@langchain/langgraph");
const events_1 = require("events");
exports.agentEvents = new events_1.EventEmitter();
const langgraph_checkpoint_sqlite_1 = require("@langchain/langgraph-checkpoint-sqlite");
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const tools_1 = require("./tools");
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("./config");
const logger_1 = require("./logger");
const audit_1 = require("./audit");
const promptBuilder_1 = require("./promptBuilder");
const historyManager_1 = require("./historyManager");
const securityManager_1 = require("./securityManager");
const datadog_1 = require("./datadog");
const parser_1 = require("./parser");
const coreMemory_1 = require("./coreMemory");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const AgentState = langgraph_1.Annotation.Root({
    messages: (0, langgraph_1.Annotation)({
        reducer: langgraph_1.messagesStateReducer,
        default: () => [],
    }),
    consecutiveErrors: (0, langgraph_1.Annotation)({
        reducer: (x, y) => y, // Sobrescreve com o valor mais recente
        default: () => 0,
    }),
    finalAnswer: (0, langgraph_1.Annotation)({
        reducer: (x, y) => y,
        default: () => null,
    }),
    context: (0, langgraph_1.Annotation)({
        reducer: (x, y) => y,
        default: () => "",
    }),
    sender: (0, langgraph_1.Annotation)({
        reducer: (x, y) => y,
        default: () => "coderNode",
    })
});
class Agent {
    historyManager;
    maxIterations;
    isSubagent;
    persona;
    graph;
    checkpointer;
    threadId;
    constructor(historyFilePath = ".agent_history.json", maxIterations, maxMessages, isSubagent = false, persona = "generic") {
        const config = (0, config_1.getConfig)();
        this.maxIterations = maxIterations ?? config.maxIterations;
        const resolvedMaxMessages = maxMessages ?? config.maxMessages;
        this.isSubagent = isSubagent;
        this.persona = persona;
        this.historyManager = new historyManager_1.HistoryManager(historyFilePath, resolvedMaxMessages);
        const initialPrompt = (0, promptBuilder_1.buildSystemPrompt)(this.persona);
        this.historyManager.loadHistory(initialPrompt);
        if (!this.isSubagent) {
            (0, audit_1.logAuditEvent)({ type: "agent_start", timestamp: new Date().toISOString() });
        }
        this.checkpointer = langgraph_checkpoint_sqlite_1.SqliteSaver.fromConnString(".langgraph_memory.db");
        this.threadId = `session_${Date.now()}`;
        this.graph = this.buildGraph();
    }
    // Métodos de histórico mantidos para compatibilidade
    loadHistory() { this.historyManager.loadHistory((0, promptBuilder_1.buildSystemPrompt)(this.persona)); }
    saveHistory() { this.historyManager.saveHistory(); }
    clearHistory() { this.historyManager.clearHistory((0, promptBuilder_1.buildSystemPrompt)(this.persona)); }
    // Helpers para converter histórico legado para LangChain Messages
    mapToLangChainMessages(messages) {
        return messages.map(msg => {
            if (msg.role === "system")
                return new messages_1.SystemMessage(msg.content);
            if (msg.role === "user")
                return new messages_1.HumanMessage(msg.content);
            if (msg.role === "assistant")
                return new messages_1.AIMessage(msg.content);
            return new messages_1.HumanMessage(msg.content);
        });
    }
    mapFromLangChainMessages(messages) {
        return messages.map(msg => {
            let role = "user";
            if (msg instanceof messages_1.SystemMessage)
                role = "system";
            else if (msg instanceof messages_1.AIMessage)
                role = "assistant";
            else if (msg instanceof messages_1.ToolMessage)
                role = "user"; // Simulando o comportamento legado
            return { role, content: msg.content };
        });
    }
    buildGraph() {
        // 0. Explorer Node: Mapeia o repositório (Agentic RAG)
        const explorerNode = async (state, config) => {
            // Se ele já finalizou a exploração
            if (state.finalAnswer && state.sender === "explorerNode") {
                return { context: state.finalAnswer, finalAnswer: null, sender: "architectNode" };
            }
            const chat = new openai_1.ChatOpenAI({
                modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
                temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
                maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
                openAIApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
                configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
            });
            const tools = tools_1.ToolRegistry.getSchemas();
            const chatWithTools = chat.bindTools(tools);
            const sysMsg = new messages_1.SystemMessage("Você é o Explorador (Agentic RAG). Entenda o pedido do usuário e vasculhe os arquivos usando list_files ou read_file para encontrar onde a mudança deve ocorrer. Quando tiver os caminhos exatos, chame finish_task reportando os caminhos encontrados.");
            const response = await chatWithTools.invoke([sysMsg, ...state.messages], config);
            response.name = "explorer";
            if ((!response.tool_calls || response.tool_calls.length === 0) && response.content) {
                const extracted = (0, parser_1.extractToolCalls)(response.content.toString());
                if (extracted && extracted.length > 0)
                    response.tool_calls = extracted;
            }
            return { messages: [response], sender: "explorerNode" };
        };
        // 1. Architect Node: Planejamento inicial
        const architectNode = async (state, config) => {
            const chat = new openai_1.ChatOpenAI({
                modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
                temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
                maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
                openAIApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
                configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
            });
            const memoryRules = coreMemory_1.CoreMemory.getRules();
            const coreRulesText = memoryRules.length > 0 ? `\nRegras Permanentes a Respeitar:\n- ${memoryRules.join('\n- ')}` : '';
            const sysMsg = new messages_1.SystemMessage(`Você é o Arquiteto de Software. 
Contexto encontrado pelo explorador sobre o repositório: ${state.context || 'Nenhum'}.${coreRulesText}
Crie um plano técnico passo-a-passo (Spec) para o Programador executar. NÃO use ferramentas. Formate explicitamente cada passo começando com "Passo 1:", "Passo 2:", etc.`);
            const response = await chat.invoke([sysMsg, ...state.messages], config);
            response.name = "architect";
            return { messages: [response], sender: "architectNode" };
        };
        // 2. Coder Node: O LLM original que tem acesso às ferramentas
        const coderNode = async (state, config) => {
            try {
                const chat = new openai_1.ChatOpenAI({
                    modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
                    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
                    maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
                    openAIApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
                    configuration: {
                        baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1"
                    }
                });
                const tools = tools_1.ToolRegistry.getSchemas();
                const chatWithTools = chat.bindTools(tools);
                // O Coder recebe o plano do arquiteto como parte das messages
                const sysMsg = new messages_1.SystemMessage("Você é o Programador (Coder). Siga rigorosamente o plano que o Arquiteto acabou de traçar na última mensagem. Use as ferramentas necessárias. Se terminar, use a ferramenta finish_task.");
                const response = await chatWithTools.invoke([sysMsg, ...state.messages], config);
                response.name = "coder";
                // Parser Híbrido: Se o modelo falhar na API nativa e cuspir texto puro
                if ((!response.tool_calls || response.tool_calls.length === 0) && response.content) {
                    const extracted = (0, parser_1.extractToolCalls)(response.content.toString());
                    if (extracted && extracted.length > 0) {
                        response.tool_calls = extracted;
                    }
                }
                return { messages: [response], sender: "coderNode" };
            }
            catch (error) {
                logger_1.Logger.error(`Erro na API do LLM (Coder): ${error.message}`);
                return {
                    messages: [new messages_1.HumanMessage(`Erro de API ao chamar o modelo: ${error.message}. Verifique a conexão.`)],
                    consecutiveErrors: state.consecutiveErrors + 1
                };
            }
        };
        // 3. QA Node: Avalia a resposta antes de enviar ao usuário
        const qaNode = async (state, config) => {
            // QA só age se o Coder disse que acabou
            if (!state.finalAnswer)
                return { messages: [] };
            const chat = new openai_1.ChatOpenAI({
                modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
                temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
                maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
                openAIApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
                configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
            });
            const sysMsg = new messages_1.SystemMessage(`Você é o Revisor de Qualidade (QA). O Coder declarou que finalizou a tarefa com a resposta: "${state.finalAnswer}". 
Se a tarefa parece cumprida, responda estritamente a palavra "APROVADO". 
Se faltou algo ou a resposta for ruim, aponte o defeito detalhadamente para o Coder corrigir.`);
            const response = await chat.invoke([sysMsg, ...state.messages], config);
            response.name = "qa";
            if (response.content.toString().includes("APROVADO")) {
                return { messages: [response] };
            }
            else {
                // Reabre a tarefa para o Coder consertar
                return { messages: [response], finalAnswer: null };
            }
        };
        // Tool Node: Executa a ferramenta e faz o Self-Healing
        const toolNode = async (state) => {
            const lastMessage = state.messages[state.messages.length - 1];
            const toolCalls = lastMessage.tool_calls || [];
            const newMessages = [];
            let currentErrors = 0;
            let finalAnswer = null;
            for (const call of toolCalls) {
                const toolName = call.name;
                const args = call.args;
                if (toolName === "finish_task") {
                    finalAnswer = args.finalAnswer || 'Concluído';
                    if (!this.isSubagent) {
                        console.log(picocolors_1.default.green(`\n🤖 Turbo-Agent Finalizou:\n${finalAnswer}\n`));
                    }
                    newMessages.push(new messages_1.ToolMessage({ tool_call_id: call.id || "0", content: "Task finished." }));
                    continue;
                }
                if (!this.isSubagent) {
                    console.log(picocolors_1.default.yellow(`\n🔧 Executando ferramenta nativa: ${toolName}`));
                }
                // Security
                const auth = await securityManager_1.SecurityManager.authorize(toolName, args, this.isSubagent);
                if (!auth.approved) {
                    newMessages.push(new messages_1.ToolMessage({ tool_call_id: call.id || "0", content: auth.userMessage }));
                    currentErrors++;
                    continue;
                }
                (0, audit_1.auditToolCall)(toolName, args);
                let toolResult = await tools_1.ToolRegistry.execute(toolName, args);
                // Self-Healing TypeScript
                const writeTools = ["write_file", "replace_in_file", "patch_file", "multi_replace_in_file"];
                if (toolResult.success && writeTools.includes(toolName)) {
                    try {
                        await execAsync("npx tsc --noEmit");
                    }
                    catch (e) {
                        toolResult.success = false;
                        toolResult.category = tools_1.ErrorCategory.EXECUTION;
                        toolResult.error = `O arquivo foi salvo, mas a compilação falhou:\n${e.stdout || e.message}`;
                    }
                }
                (0, audit_1.auditToolResult)(toolName, JSON.stringify(toolResult));
                let resultString = JSON.stringify(toolResult);
                if (resultString.length > 3000) {
                    resultString = resultString.substring(0, 3000) + "\n... [Saída truncada]";
                }
                if (!toolResult.success) {
                    currentErrors++;
                    const errorMsg = `Tool failed:\n${resultString}\n\n[SELF-HEALING]: Analise o erro, corrija os argumentos e tente novamente. Tentativa ${state.consecutiveErrors + 1} de 3.`;
                    newMessages.push(new messages_1.ToolMessage({ tool_call_id: call.id || "0", content: errorMsg }));
                }
                else {
                    newMessages.push(new messages_1.ToolMessage({ tool_call_id: call.id || "0", content: resultString }));
                }
            }
            return {
                messages: newMessages,
                consecutiveErrors: currentErrors > 0 ? state.consecutiveErrors + 1 : 0,
                finalAnswer
            };
        };
        // Lógica de Roteamento (Edges)
        const routeFromExplorer = (state) => {
            // Se chamou ferramenta (ex: list_files)
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0)
                return "tools";
            // Se terminou de explorar (reportou finalAnswer via finish_task)
            if (state.context)
                return "architectNode";
            return "architectNode"; // Fallback de segurança se ele só gerou texto
        };
        const routeFromArchitect = (state) => {
            const lastMessage = state.messages[state.messages.length - 1];
            const content = lastMessage.content.toString();
            // Quebra o plano em passos paralelos se o LLM seguiu a formatação
            const plans = content.split(/Passo \d+:/i).filter(p => p.trim().length > 10);
            if (plans.length > 1) {
                // Paralelismo agressivo: Cria um nó Coder independente para cada Passo!
                return plans.map(plan => new langgraph_1.Send("coderNode", {
                    messages: [new messages_1.SystemMessage("TAREFA ISOLADA. Siga este plano: " + plan)],
                    sender: "coderNode"
                }));
            }
            return "coderNode";
        };
        const routeFromCoder = (state) => {
            if (state.consecutiveErrors >= 3)
                return langgraph_1.END; // Circuit Breaker
            const lastMessage = state.messages[state.messages.length - 1];
            // Se ele chamou ferramentas, vai pro Node Tools
            if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0)
                return "tools";
            if (state.finalAnswer)
                return "qaNode";
            return langgraph_1.END;
        };
        const routeFromTools = (state) => {
            // Retorna a execução para quem chamou a ferramenta (Explorer ou Coder)
            return state.sender === "explorerNode" ? "explorerNode" : "coderNode";
        };
        const routeFromQA = (state) => {
            // Se o QA anulou o finalAnswer, significa que ele reprovou e quer que o Coder refaça.
            if (!state.finalAnswer)
                return "coderNode";
            return langgraph_1.END;
        };
        const workflow = new langgraph_1.StateGraph(AgentState)
            .addNode("explorerNode", explorerNode)
            .addNode("architectNode", architectNode)
            .addNode("coderNode", coderNode)
            .addNode("qaNode", qaNode)
            .addNode("tools", toolNode)
            .addEdge(langgraph_1.START, "explorerNode")
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
    async abortPlan() {
        // Injeta mensagem de rejeição no estado para o Coder (se quisermos) ou apenas finaliza.
        // O mais simples é apenas limpar o estado.
        const stateSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
        await this.graph.updateState({ configurable: { thread_id: this.threadId } }, { messages: [new messages_1.HumanMessage("PLANO ABORTADO PELO USUÁRIO. Cancele a operação e chame finish_task.")] });
        await this.runStep(null);
    }
    async rewindState(steps) {
        const history = [];
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
        await this.graph.updateState({ configurable: { thread_id: this.threadId } }, targetState);
        return true;
    }
    async runStep(userPrompt) {
        const isJson = (0, config_1.getConfig)().logFormat === 'json';
        // Na primeira iteração da sessão, injetamos o system prompt legado.
        // O SqliteSaver cuidará de não duplicar isso nas próximas rodadas.
        const stateSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
        const isFirstRun = !stateSnapshot?.values?.messages || stateSnapshot.values.messages.length === 0;
        let initialMessages = [];
        if (isFirstRun && userPrompt) {
            initialMessages = this.mapToLangChainMessages(this.historyManager.messages);
        }
        if (userPrompt) {
            initialMessages.push(new messages_1.HumanMessage(userPrompt));
        }
        // Prepara o estado inicial. Se for null (resumo), passamos null.
        let currentState = userPrompt ? {
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
                        const displayName = nodeName === "architect" ? "📐 Arquiteto" : "🤖 Coder";
                        process.stdout.write(picocolors_1.default.green(`\n\n${displayName} Raciocinando...\n`));
                        exports.agentEvents.emit("system", `\n\n${displayName} Raciocinando...\n`);
                        printedAgentHeader = nodeName;
                    }
                    if (chunk.content) {
                        process.stdout.write(picocolors_1.default.cyan(chunk.content));
                        exports.agentEvents.emit("token", chunk.content);
                    }
                }
                else if (event.event === "on_tool_start") {
                    if (!this.isSubagent && !isJson) {
                        const toolName = event.name;
                        process.stdout.write(picocolors_1.default.yellow(`\n[🔄 Executando ferramenta: ${toolName}...]\n`));
                        exports.agentEvents.emit("tool_start", toolName);
                    }
                }
                else if (event.event === "on_tool_end") {
                    if (!this.isSubagent && !isJson) {
                        process.stdout.write(picocolors_1.default.green(`[✅ Ferramenta concluída]\n`));
                        exports.agentEvents.emit("tool_end");
                    }
                }
                else if (event.event === "on_chain_end" && event.name === "LangGraph") {
                    currentState = event.data.output;
                }
            }
            if (!this.isSubagent && !isJson) {
                process.stdout.write("\n\n");
            }
            const finalSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
            if (finalSnapshot.next && finalSnapshot.next.length > 0) {
                exports.agentEvents.emit("pause");
                return { status: 'paused' };
            }
            exports.agentEvents.emit("end");
            const result = currentState;
            await datadog_1.DatadogDispatcher.flush();
            try {
                const finalSnapshot = await this.graph.getState({ configurable: { thread_id: this.threadId } });
                if (finalSnapshot?.values?.messages) {
                    this.historyManager.messages = this.mapFromLangChainMessages(finalSnapshot.values.messages);
                    this.historyManager.saveHistory();
                }
            }
            catch (e) {
                logger_1.Logger.warn("Erro ao fazer backup legado do histórico: " + e.message);
            }
            if (result.consecutiveErrors >= 3) {
                console.log(picocolors_1.default.red("\n[Circuit Breaker] Abortando execução por falhas repetidas."));
                return "Erro crítico: O agente falhou 3 vezes consecutivas e o Circuit Breaker foi ativado.";
            }
            return result.finalAnswer || "Execução concluída sem resposta final definida.";
        }
        catch (e) {
            logger_1.Logger.error(`Erro crítico no LangGraph: ${e.message}`);
            return `Error: ${e.message}`;
        }
    }
}
exports.Agent = Agent;
