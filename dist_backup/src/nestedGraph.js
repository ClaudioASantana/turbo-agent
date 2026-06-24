"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTestAndFix = runTestAndFix;
const langgraph_1 = require("@langchain/langgraph");
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const SubGraphState = langgraph_1.Annotation.Root({
    command: (0, langgraph_1.Annotation)({ reducer: (x, y) => y, default: () => "" }),
    output: (0, langgraph_1.Annotation)({ reducer: (x, y) => y, default: () => "" }),
    error: (0, langgraph_1.Annotation)({ reducer: (x, y) => y, default: () => null }),
    iterations: (0, langgraph_1.Annotation)({ reducer: (x, y) => y, default: () => 0 }),
});
async function runTestAndFix(command) {
    const executeNode = async (state) => {
        try {
            const { stdout, stderr } = await execAsync(state.command, { timeout: 30000 });
            return { output: stdout || "Sucesso", error: null, iterations: state.iterations + 1 };
        }
        catch (err) {
            return { output: err.stdout || "", error: err.stderr || err.message, iterations: state.iterations + 1 };
        }
    };
    const fixNode = async (state) => {
        const chat = new openai_1.ChatOpenAI({
            modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
            temperature: 0.1,
            openAIApiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
            configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
        });
        const msg = new messages_1.SystemMessage(`O comando "${state.command}" falhou.
Saída: ${state.output}
Erro: ${state.error}
Retorne um script bash rápido para consertar o ambiente/arquivos e rodar o comando novamente.`);
        const response = await chat.invoke([msg]);
        // Extraímos o bash se houver (assumindo que o LLM responde com código)
        let fixCmd = response.content.toString();
        const match = /```(?:bash)?\s*([\s\S]*?)\s*```/i.exec(fixCmd);
        if (match)
            fixCmd = match[1];
        // Executamos o fix e preparamos para tentar o comando principal de novo
        try {
            await execAsync(fixCmd, { timeout: 10000 });
        }
        catch (e) { }
        return {}; // Estado não muda muito, a aresta volta pro executeNode
    };
    const router = (state) => {
        if (!state.error)
            return langgraph_1.END; // Se rodou limpo, acaba.
        if (state.iterations >= 3)
            return langgraph_1.END; // Limite de 3 tentativas
        return "fixNode";
    };
    const subGraph = new langgraph_1.StateGraph(SubGraphState)
        .addNode("executeNode", executeNode)
        .addNode("fixNode", fixNode)
        .addEdge(langgraph_1.START, "executeNode")
        .addConditionalEdges("executeNode", router)
        .addEdge("fixNode", "executeNode")
        .compile();
    const result = await subGraph.invoke({ command, iterations: 0 });
    if (result.error) {
        return `Comando falhou após ${result.iterations} tentativas de auto-cura.\nErro: ${result.error}`;
    }
    return `Sucesso após ${result.iterations} tentativa(s).\nSaída: ${result.output}`;
}
