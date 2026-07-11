import { SystemMessage } from "@langchain/core/messages";
import { getChatModel } from "../../llmClient";
import pc from "picocolors";
import { CognitiveMemorySystem } from "../../memoryOrchestrator";
import { AgentState } from "../state";

export const architectNode = async (state: typeof AgentState.State, config: any) => {
  const chat = getChatModel();

  let userPrompt = "";
  for (let i = state.messages.length - 1; i >= 0; i--) {
     if (state.messages[i]._getType() === "human") {
        const content = state.messages[i].content;
        userPrompt = typeof content === 'string' ? content : (Array.isArray(content) ? content.map((c:any) => c.text || '').join('') : JSON.stringify(content));
        break;
     }
  }
  const globalContext = userPrompt ? await CognitiveMemorySystem.retrieveGlobalContext(userPrompt) : "";

  const sysMsg = new SystemMessage(`Você é o Arquiteto de Software.
Contexto global e memórias do projeto:\n${globalContext}

Contexto encontrado pelo explorador sobre o repositório: ${state.context || 'Nenhum'}.
Se a tarefa for complexa, considere usar a ferramenta list_skills para ver se há regras ou diretrizes a seguir no projeto antes de planejar.
Crie um plano técnico passo-a-passo (Spec) para o Programador executar. NÃO use ferramentas de escrita de código. Formate explicitamente cada passo começando com "Passo 1:", "Passo 2:", etc.`);

  const cleanMessages = state.messages.filter((m: any) => m._getType() !== "system");
  console.log(pc.cyan(`\n🤔 Planejando Arquitetura... (Architect)`));
  const response = await chat.invoke([sysMsg, ...cleanMessages], config);
  response.name = "architect";

  return { messages: [response], sender: "architectNode" };
};