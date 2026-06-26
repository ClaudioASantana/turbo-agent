import { Annotation, BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core";
import { ChatOpenAI } from "@langchain/openai";
import { ToolRegistry } from "../../tools";
import { extractToolCalls } from "../../parser";
import pc from "picocolors";
import { Logger } from "../../logger";

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => y,
    default: () => [],
  }),
  consecutiveErrors: Annotation<number>({
    reducer: (x, y) => y,
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

export const coderNode = async (state: typeof AgentState.State, config: any, isSubagent: boolean = false) => {
  try {
    const chat = new ChatOpenAI({
      modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
      temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
      maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
      apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
      streamUsage: false,
      maxRetries: 0,
      streaming: true,
      configuration: {
        baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1"
      }
    });

    const tools = ToolRegistry.getSchemas();
    const toolsPrompt = `\nFERRAMENTAS DISPONÍVEIS:\nVocê DEVE usar as ferramentas respondendo com um JSON puro no formato: {"tool": "nome", "args": { ... } }\nSchemas:\n` + JSON.stringify(tools, null, 2);
    const chatWithTools = chat;

    const sysMsg = new SystemMessage(`Você é o Programador (Coder) e Gerente de Sub-Agentes. Siga rigorosamente o plano que o Arquiteto acabou de traçar na última mensagem. Use as ferramentas necessárias.
IMPORTANTE: Você roda no sistema HOST do usuário e tem acesso irrestrito a TODOS os arquivos do computador (incluindo fora do workspace) usando as ferramentas read_file, list_files, etc. O seu diretório de trabalho atual (CWD) no host é: ${process.cwd()}
Apenas a ferramenta 'run_command' roda dentro de um container Docker isolado que só acessa o /workspace.
SE O PLANO EXIGIR ALTERAR VÁRIOS ARQUIVOS INDEPENDENTES: Você NÃO deve alterá-los sequencialmente. Você DEVE usar a ferramenta invoke_parallel_subagents passando um array com as instruções de cada arquivo, para que seus sub-agentes os modifiquem simultaneamente. NUNCA delegue o mesmo arquivo para mais de um sub-agente.
Sempre que for fazer grandes refatorações você mesmo, use \`preview_file_changes\` primeiro e depois use \`request_user_approval\` para perguntar se o usuário concorda, antes de usar ferramentas destrutivas de escrita.
Toda vez que você criar ou modificar uma função/feature, você OBRIGATORIAMENTE DEVE usar a ferramenta \`invoke_subagent\` para delegar a escrita dos testes unitários para um Sub-Agente especializado (diga a ele: 'Escreva os testes em Vitest para o arquivo X'). Não escreva os testes você mesmo!
Se terminar todo o trabalho solicitado, ANTES de chamar finish_task, você OBRIGATORIAMENTE deve chamar a ferramenta \`create_pull_request\` para efetuar o commit do código validado e enviá-lo ao GitHub. A mensagem de commit DEVE seguir o padrão Semantic Commits (feat:, fix:, chore:, refactor:, docs:, test:, style:). Só depois chame finish_task.${toolsPrompt}`);
    const cleanMessages = state.messages.filter(m => m._getType() !== "system");

    const response = await chatWithTools.invoke([sysMsg, ...cleanMessages], config);
    response.name = "coder";

    if ((!response.tool_calls || response.tool_calls.length === 0) && response.content) {
        const extracted = extractToolCalls(response.content.toString());
        if (extracted && extracted.length > 0) {
           response.tool_calls = extracted;
        }
    }

    if (!response.content && (!response.tool_calls || response.tool_calls.length === 0)) {
        response.content = "⚠️ O proxy do LLM retornou uma resposta vazia ou corrompida no Coder. Por favor, verifique o provedor.";
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