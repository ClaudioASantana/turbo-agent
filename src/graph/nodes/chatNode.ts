import { SystemMessage } from "@langchain/core/messages";
import { getChatModel } from "../../llmClient";
import pc from "picocolors";
import { AgentState } from "../state";
import { Logger } from "../../logger";

export const chatNode = async (state: typeof AgentState.State, config: any) => {
  try {
    const chat = getChatModel({
      modelName: process.env.ROUTER_LLM_MODEL,
      temperature: 0.5,
      maxTokens: 2048,
      streaming: true
    });

    const sysMsg = new SystemMessage(`Você é um assistente prestativo.
Como o usuário fez uma pergunta ou comentário simples (ex: saudação ou conversa), responda diretamente de forma amigável e concisa, sem tentar usar ferramentas.`);

    const cleanMessages = state.messages.filter((m: any) => m._getType() !== "system");

    console.log(pc.cyan(`\n🤔 Conversando... (Chat)`));
    const response = await chat.invoke([sysMsg, ...cleanMessages], config);
    response.name = "chat";

    return { 
      messages: [response], 
      sender: "chatNode", 
      finalAnswer: response.content.toString() 
    };
  } catch (error: any) {
    Logger.error(`Erro na API do LLM (Chat): ${error.message}`);
    return { sender: "chatNode", finalAnswer: "Ocorreu um erro ao processar sua resposta." };
  }
};
