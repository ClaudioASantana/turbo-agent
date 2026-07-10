import { SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { CoreMemory } from "../../coreMemory";
import { AgentState } from "../state";

export const architectNode = async (state: typeof AgentState.State, config: any) => {
  const chat = new ChatOpenAI({
    modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
    temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
    maxTokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
    streamUsage: false,
    maxRetries: 0,
    configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
  });

  const memoryRules = CoreMemory.getRules();
  const coreRulesText = memoryRules.length > 0 ? `\nRegras Permanentes a Respeitar:\n- ${memoryRules.join('\n- ')}` : '';

  const sysMsg = new SystemMessage(`Você é o Arquiteto de Software.
Contexto encontrado pelo explorador sobre o repositório: ${state.context || 'Nenhum'}.${coreRulesText}
Se a tarefa for complexa, considere usar a ferramenta list_skills para ver se há regras ou diretrizes a seguir no projeto antes de planejar.
Crie um plano técnico passo-a-passo (Spec) para o Programador executar. NÃO use ferramentas de escrita de código. Formate explicitamente cada passo começando com "Passo 1:", "Passo 2:", etc.`);

  const cleanMessages = state.messages.filter((m: any) => m._getType() !== "system");
  console.log("INVOKING CHAT WITH:", JSON.stringify([sysMsg, ...cleanMessages])); const response = await chat.invoke([sysMsg, ...cleanMessages], config);
  response.name = "architect";

  return { messages: [response], sender: "architectNode" };
};