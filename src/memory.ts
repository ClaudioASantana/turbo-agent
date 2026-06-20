import { openai } from "./llmClient";

const SUMMARIZER_PROMPT = `Você é um compactador de memória de IA. 
Sua tarefa é ler um histórico longo de interações entre um Usuário e um Agente de IA e extrair metadados.
Responda EXCLUSIVAMENTE com um objeto JSON neste formato:
{
  "resumo_geral": "Parágrafo curto descrevendo o progresso alcançado",
  "arquivos_modificados": ["caminho/arquivo1", "caminho/arquivo2"],
  "comandos_executados": ["npm install", "tsc"],
  "decisoes_tecnicas": ["Extraiu função X por motivo Y"]
}
Não insira blocos de código markdown ou texto solto. Apenas o JSON puro.`;

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
      response_format: { type: "json_object" },
    });

    const rawContent = response.choices[0].message.content || "{}";
    
    try {
        const parsed = JSON.parse(rawContent);
        let markdown = `**Contexto Consolidado:**\n${parsed.resumo_geral || "Sem resumo."}\n\n`;
        
        if (parsed.arquivos_modificados && parsed.arquivos_modificados.length > 0) {
            markdown += `**📁 Arquivos Afetados:**\n` + parsed.arquivos_modificados.map((f: string) => `- \`${f}\``).join("\n") + "\n\n";
        }
        if (parsed.comandos_executados && parsed.comandos_executados.length > 0) {
            markdown += `**💻 Comandos Executados:**\n` + parsed.comandos_executados.map((c: string) => `- \`${c}\``).join("\n") + "\n\n";
        }
        if (parsed.decisoes_tecnicas && parsed.decisoes_tecnicas.length > 0) {
            markdown += `**🧠 Decisões e Conhecimento:**\n` + parsed.decisoes_tecnicas.map((d: string) => `- ${d}`).join("\n") + "\n\n";
        }
        
        return markdown.trim();
    } catch (parseError) {
        // Fallback gracefully se o modelo vomitar texto em vez de JSON
        return rawContent;
    }
  } catch (error: any) {
    throw new Error(`Falha ao compactar memória: ${error.message}`);
  }
}
