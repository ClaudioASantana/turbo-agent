import { SystemMessage } from "@langchain/core/messages";
import { getChatModel } from "../../llmClient";
import pc from "picocolors";
import { ToolRegistry } from "../../tools";
import { extractToolCalls } from "../../parser";
import { AgentState } from "../state";

export const qaNode = async (state: typeof AgentState.State, config: any) => {
  if (!state.finalAnswer) return { messages: [] };

  const tools = ToolRegistry.getSchemas();
  const chat = getChatModel({}, tools);

  const sysMsg = new SystemMessage(`Você é o Revisor de Qualidade (QA). O Coder declarou que finalizou a tarefa com a resposta: "${state.finalAnswer}".
Antes de aprovar, você OBRIGATORIAMENTE DEVE usar a ferramenta \`run_unit_tests\` para verificar se a suíte de testes do projeto passou.
Se os testes passarem perfeitamente, responda estritamente a palavra "APROVADO".
Se algum teste falhar, aponte o defeito detalhadamente (copiando o erro do terminal) para o Coder corrigir.`);

  const chatWithTools = chat;

  const cleanMessages = state.messages.filter((m: any) => m._getType() !== "system");
  console.log(pc.cyan(`\n🤔 Avaliando qualidade... (QA)`));
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