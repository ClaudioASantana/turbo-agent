import { SystemMessage } from "@langchain/core/messages";
import { getChatModel } from "../../llmClient";
import pc from "picocolors";
import { AgentState } from "../state";
import { Logger } from "../../logger";

export const routerNode = async (state: typeof AgentState.State, config: any) => {
  try {
    const chat = getChatModel({
      modelName: process.env.ROUTER_LLM_MODEL,
      temperature: 0,
      maxTokens: 50
    });

    const sysMsg = new SystemMessage(`Você é o Roteador de Tarefas. Analise a última mensagem do usuário.
Responda EXCLUSIVAMENTE com um objeto JSON no formato: {"route": "chat"} ou {"route": "explore"}.
Use "chat" se for apenas uma saudação, conversa geral ou dúvida que você consegue responder sem olhar arquivos.
Use "explore" se o usuário estiver pedindo para criar, alterar, analisar código, procurar arquivos ou se precisar buscar na internet.
NÃO responda com mais nada além do JSON.`);

    const cleanMessages = state.messages.filter((m: any) => m._getType() !== "system");

    console.log(pc.cyan(`\n🤔 Triando intenção... (Router)`));
    const response = await chat.invoke([sysMsg, ...cleanMessages], config);
    
    let route = "explore";
    try {
      let content = response.content.toString().trim();
      if (content.startsWith("\`\`\`json")) {
         content = content.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
      }
      const parsed = JSON.parse(content);
      if (parsed.route === "chat") {
        route = "chat";
      }
    } catch (e) {
      Logger.warn("Router falhou em retornar JSON válido. Fazendo fallback para 'explore'.");
    }

    return { sender: "routerNode", context: route };
  } catch (error: any) {
    Logger.error(`Erro na API do LLM (Router): ${error.message}`);
    return { sender: "routerNode", context: "explore" };
  }
};
