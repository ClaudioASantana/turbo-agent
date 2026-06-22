import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

const SubGraphState = Annotation.Root({
    command: Annotation<string>({ reducer: (x, y) => y, default: () => "" }),
    output: Annotation<string>({ reducer: (x, y) => y, default: () => "" }),
    error: Annotation<string | null>({ reducer: (x, y) => y, default: () => null }),
    iterations: Annotation<number>({ reducer: (x, y) => y, default: () => 0 }),
});

export async function runTestAndFix(command: string): Promise<string> {
    const executeNode = async (state: typeof SubGraphState.State) => {
        try {
            const { stdout, stderr } = await execAsync(state.command, { timeout: 30000 });
            return { output: stdout || "Sucesso", error: null, iterations: state.iterations + 1 };
        } catch (err: any) {
            return { output: err.stdout || "", error: err.stderr || err.message, iterations: state.iterations + 1 };
        }
    };

    const fixNode = async (state: typeof SubGraphState.State) => {
        const chat = new ChatOpenAI({
            modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
            temperature: 0.1,
            apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
            streamUsage: false,
            configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
        });
        const msg = new SystemMessage(`O comando "${state.command}" falhou.
Saída: ${state.output}
Erro: ${state.error}
Retorne um script bash rápido para consertar o ambiente/arquivos e rodar o comando novamente.`);
        const response = await chat.invoke([msg]);
        // Extraímos o bash se houver (assumindo que o LLM responde com código)
        let fixCmd = response.content.toString();
        const match = /```(?:bash)?\s*([\s\S]*?)\s*```/i.exec(fixCmd);
        if (match) fixCmd = match[1];
        
        // Executamos o fix e preparamos para tentar o comando principal de novo
        try {
            await execAsync(fixCmd, { timeout: 10000 });
        } catch (e) {}

        return {}; // Estado não muda muito, a aresta volta pro executeNode
    };

    const router = (state: typeof SubGraphState.State) => {
        if (!state.error) return END; // Se rodou limpo, acaba.
        if (state.iterations >= 3) return END; // Limite de 3 tentativas
        return "fixNode";
    };

    const subGraph = new StateGraph(SubGraphState)
        .addNode("executeNode", executeNode)
        .addNode("fixNode", fixNode)
        .addEdge(START, "executeNode")
        .addConditionalEdges("executeNode", router)
        .addEdge("fixNode", "executeNode")
        .compile();

    const result = await subGraph.invoke({ command, iterations: 0 });
    
    if (result.error) {
       return `Comando falhou após ${result.iterations} tentativas de auto-cura.\nErro: ${result.error}`;
    }
    return `Sucesso após ${result.iterations} tentativa(s).\nSaída: ${result.output}`;
}
