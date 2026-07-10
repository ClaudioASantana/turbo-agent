import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ToolRegistry } from "../../tools";
import { extractToolCalls } from "../../parser";
import { normalizeMessages, AgentState } from "../state";

export const explorerNode = async (state: typeof AgentState.State, config: any) => {
  if (state.finalAnswer && state.sender === "explorerNode") {
     return { context: state.finalAnswer, finalAnswer: null, sender: "architectNode" };
  }

  const chat = new ChatOpenAI({
    modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
    maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
    streamUsage: false,
    maxRetries: 0,
    streaming: true,
    configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
  });

  const tools = ToolRegistry.getSchemas();
  const toolsPrompt = `\nFERRAMENTAS DISPONÍVEIS:\nVocê DEVE chamar ferramentas respondendo com um JSON neste formato: {"tool": "nome", "args": { ... } }\nSchemas das ferramentas:\n` + JSON.stringify(tools, null, 2);
  const chatWithTools = chat;

  const { recall } = await import("../../memoryVector");
  let userPrompt = "";
  for (let i = state.messages.length - 1; i >= 0; i--) {
     if (state.messages[i]._getType() === "human") {
        const content = state.messages[i].content;
        userPrompt = typeof content === 'string' ? content : (Array.isArray(content) ? content.map((c:any) => c.text || '').join('') : JSON.stringify(content));
        break;
     }
  }
  const pastMemories = userPrompt ? await recall(userPrompt, 3, 0.25) : [];
  const memoryText = pastMemories.length > 0 ? `\nMEMÓRIAS PASSADAS RELEVANTES AO CONTEXTO:\n- ${pastMemories.join('\n- ')}\n` : "";

  const sysMsg = new SystemMessage(`Você é o Explorador (Agentic RAG). Entenda o pedido do usuário e vasculhe os arquivos usando list_files ou read_file para encontrar onde a mudança deve ocorrer. Quando tiver os caminhos exatos, chame finish_task reportando os caminhos encontrados.${memoryText}
Se a tarefa for complexa, use a ferramenta list_skills para ver se há diretrizes específicas do projeto, E use list_knowledge_items para ler regras e lições aprendidas de sessões anteriores antes de seguir.
IMPORTANTE: Você roda no sistema HOST do usuário e tem acesso irrestrito a TODOS os arquivos do computador usando read_file, list_files, etc. O seu diretório de trabalho atual (CWD) no host é: ${process.cwd()}
Apenas a ferramenta 'run_command' roda dentro de um container Docker restrito.
SE O USUÁRIO APENAS MANDAR UMA SAUDAÇÃO (ex: "olá"), responda amigavelmente em texto puro e NÃO chame ferramentas.
SE O USUÁRIO FIZER UMA PERGUNTA QUE EXIGE DADOS DA INTERNET (ex: clima, notícias, cotações), VOCÊ ESTÁ ESTRITAMENTE PROIBIDO de dizer que não tem acesso. VOCÊ DEVE OBRIGATORIAMENTE chamar a ferramenta "web_search" ou "invoke_browser_subagent" para buscar a resposta no Google/DuckDuckGo antes de responder.${toolsPrompt}`);
  const cleanMessages = normalizeMessages(state.messages.filter((m: any) => m._getType() !== "system"));
  console.log("PAYLOAD MESSAGES TO LLM:", JSON.stringify([sysMsg, ...cleanMessages]));
  const response = await chatWithTools.invoke([sysMsg, ...cleanMessages], config);
  console.log("[DEBUG EXPLORER] RAW RESPONSE:", JSON.stringify(response));
  response.name = "explorer";

  if ((!response.tool_calls || response.tool_calls.length === 0) && response.content) {
      const extracted = extractToolCalls(response.content.toString());
      if (extracted && extracted.length > 0) response.tool_calls = extracted;
  }

  if (!response.content && (!response.tool_calls || response.tool_calls.length === 0)) {
      response.content = "⚠️ O proxy do LLM retornou uma resposta vazia ou corrompida. Por favor, tente novamente.";
  }

  return { messages: [response], sender: "explorerNode" };
};