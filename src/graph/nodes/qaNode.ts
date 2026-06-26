import { Annotation, BaseMessage, AIMessage, SystemMessage } from "@langchain/core";
import { ChatOpenAI } from "@langchain/openai";
import { ToolRegistry } from "../../tools";
import { extractToolCalls } from "../../parser";

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

export const qaNode = async (state: typeof AgentState.State, config: any) => {
  if (!state.finalAnswer) return { messages: [] };

  const chat = new ChatOpenAI({
    modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
    maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
    streamUsage: false,
    maxRetries: 0,
    configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
  });

  const sysMsg = new SystemMessage(`Você é o Revisor de Qualidade (QA). O Coder declarou que finalizou a tarefa com a resposta: "${state.finalAnswer}".
Antes de aprovar, você OBRIGATORIAMENTE DEVE usar a ferramenta \`run_unit_tests\` para verificar se a suíte de testes do projeto passou.
Se os testes passarem perfeitamente, responda estritamente a palavra "APROVADO".
Se algum teste falhar, aponte o defeito detalhadamente (copiando o erro do terminal) para o Coder corrigir.`);

  const tools = ToolRegistry.getSchemas();
  const chatWithTools = chat.bindTools(tools);

  const cleanMessages = state.messages.filter(m => m._getType() !== "system");
  console.log("INVOKING QA CHAT WITH:", JSON.stringify([sysMsg, ...cleanMessages]));
  const response = await chatWithTools.invoke([sysMsg, ...cleanMessages], config);
  response.name = "qa";

  if ((!response.tool_calls || response.tool_calls.length === 0) && response.content) {
      const extracted = extractToolCalls(response.content.toString());
      if (extracted && extracted.length > 0) {
         response.tool_calls = extracted;
      }
  }

  if (response.content && response.content.toString().includes("APROVADO")) {
     return { messages: [response], sender: "qaNode" };
  } else if (response.tool_calls && response.tool_calls.length > 0) {
     return { messages: [response], sender: "qaNode" };
  } else {
     return { messages: [response], finalAnswer: null, sender: "qaNode" };
  }
};