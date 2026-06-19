import { openai } from "./llmClient";

const SUMMARIZER_PROMPT = `Você é um compactador de memória de IA. 
Sua tarefa é ler um histórico longo de interações entre um Usuário e um Agente de IA e criar um resumo altamente condensado e factual.
Regras:
1. Preserve nomes de arquivos, caminhos de pastas, comandos usados e decisões tomadas.
2. Ignore cumprimentos, saudações ou jargões ("Olá", "Vou fazer", etc).
3. Seja direto e objetivo, como um diário de bordo.
4. Responda APENAS com o texto do resumo. Não use tags XML na sua saída final.`;

export async function summarizeMessages(messages: any[]): Promise<string> {
  // Converte as mensagens para um texto legível para o compactador (filtrando imagens Base64)
  const conversationText = messages.map(m => {
    let text = "";
    if (typeof m.content === "string") {
        text = m.content;
    } else if (Array.isArray(m.content)) {
        text = m.content.map((c: any) => c.type === 'image_url' ? '[IMAGEM CAPTURADA PELO NAVEGADOR]' : c.text).join(" ");
    } else {
        text = JSON.stringify(m.content);
    }
    return `[${m.role.toUpperCase()}]: ${text}`;
  }).join("\n\n");

  try {
    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || "qwen-35b-turboquant",
      messages: [
        { role: "system", content: SUMMARIZER_PROMPT },
        { role: "user", content: `Resuma o seguinte histórico:\n\n${conversationText}` }
      ],
      temperature: 0.1,
    });

    return response.choices[0].message.content || "Resumo indisponível.";
  } catch (error: any) {
    throw new Error(`Falha ao compactar memória: ${error.message}`);
  }
}
