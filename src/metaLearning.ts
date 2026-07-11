import { getChatModel } from "./llmClient";
import { SystemMessage } from "@langchain/core/messages";
import { CoreMemory } from "./coreMemory";
import { Logger } from "./logger";
import pc from "picocolors";

export async function reflectOnFailure(messages: any[], userPrompt: string): Promise<void> {
    Logger.info(pc.magenta("\n🧠 [Meta-Learning] Iniciando processo de auto-reflexão sobre falha..."));

    try {
        const chat = getChatModel({ temperature: 0.2, maxTokens: 500 });
        
        const conversationText = messages.map(m => {
            let text = "";
            if (typeof m.content === "string") text = m.content;
            else if (Array.isArray(m.content)) text = m.content.map((c: any) => c.text || '').join(" ");
            else text = JSON.stringify(m.content);
            return `[${m.name || m._getType().toUpperCase()}]: ${text}`;
        }).join("\n\n");

        const sysMsg = new SystemMessage(`Você é o Módulo de Meta-Aprendizado (Self-Reflection) de um agente de inteligência artificial autônomo.
O agente tentou realizar a seguinte tarefa solicitada pelo usuário: "${userPrompt}"
No entanto, o agente FALHOU repetidas vezes, seja quebrando regras de código, caindo em loop ou reprovando nos testes.

Aqui está o histórico completo da sessão de erro:
${conversationText}

Sua tarefa:
Analise o histórico e identifique EXATAMENTE onde e por que o agente falhou.
Em seguida, escreva UMA REGRA DE OURO clara, direta e acionável para que o agente (Arquiteto ou Programador) nunca mais cometa esse mesmo erro no futuro.

A regra deve começar com uma instrução forte, por exemplo: "SEMPRE que for modificar X, certifique-se de Y".

Responda APENAS com o texto final da regra. Não adicione saudações ou explicações.`);

        const response = await chat.invoke([sysMsg]);
        const rule = response.content.toString().trim();

        if (rule) {
            CoreMemory.addRule(rule);
            Logger.info(pc.green(`\n✨ [Meta-Learning] Nova lição aprendida e gravada permanentemente na memória procedimental:`));
            Logger.info(pc.green(`-> "${rule}"`));
        }

    } catch (e: any) {
        Logger.error(`Falha no processo de auto-reflexão: ${e.message}`);
    }
}
