import * as fs from "fs";
import * as path from "path";
import { openai } from "./llmClient";
import { extractToolCalls } from "./parser";
import { availableTools, executeTool } from "./tools";
import { promptUser } from "./promptUser";

const SYSTEM_PROMPT = `You are an autonomous AI assistant running locally on Qwen 2.5 Coder.
You have access to the following tools:
${JSON.stringify(availableTools, null, 2)}

You MUST think before you act. Use a <thought>...</thought> block to analyze the user's request, plan your approach, or reason about the results of your tools.
After your thought block, to use a tool, you MUST respond EXACTLY with a JSON object in this format, and NOTHING ELSE:
{
  "tool": "tool_name",
  "args": {
    "param1": "value1"
  }
}

Do not add conversational text or greetings outside the thought block. Your response must end with the JSON tool call.
You can use multiple tools in sequence. When you are completely finished with the user's request, call the "finish_task" tool with your final answer.
`;

// Global message history
let globalMessages: any[] = [
  { role: "system", content: SYSTEM_PROMPT }
];

const HISTORY_FILE = path.join(process.cwd(), ".agent_history.json");

export function loadHistory() {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Atualiza a primeira mensagem com o SYSTEM_PROMPT atual para garantir que as ferramentas estejam sempre atualizadas
        parsed[0] = { role: "system", content: SYSTEM_PROMPT };
        globalMessages = parsed;
        console.log(`[Memória restaurada: ${globalMessages.length} mensagens no contexto]`);
      }
    } catch (e) {
      console.log("[Erro ao carregar histórico]:", e);
    }
  }
}

export function saveHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(globalMessages, null, 2), "utf-8");
  } catch (e) {
    console.log("[Erro ao salvar histórico]:", e);
  }
}

export function clearHistory() {
  globalMessages = [
    { role: "system", content: SYSTEM_PROMPT }
  ];
  saveHistory();
  console.log("[Memória apagada com sucesso]");
}

export async function runAgentStep(userPrompt: string) {
  // Add user prompt to history
  globalMessages.push({ role: "user", content: userPrompt });
  saveHistory();

  const MAX_ITERATIONS = 256;
  let loops = 0;
  while (loops < MAX_ITERATIONS) {
    loops++;

    // Sliding Window: Limitar o número de mensagens para evitar estourar o limite de tokens
    const MAX_MESSAGES = 20;
    if (globalMessages.length > MAX_MESSAGES) {
      globalMessages = [
        globalMessages[0], // System prompt
        ...globalMessages.slice(-(MAX_MESSAGES - 1)) // Últimas mensagens
      ];
    }

    console.log("...pensando...");
    const response = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || "qwen-35b-turboquant",
      messages: globalMessages,
      temperature: 0.1,
    });


    const reply = response.choices[0].message.content || "";
    console.log(`\n[LLM Raw Reply]:\n${reply}\n`);

    globalMessages.push({ role: "assistant", content: reply });
    saveHistory();

    const toolCall = extractToolCalls(reply);

    if (toolCall && toolCall.tool) {
      console.log(`\n[Ação Solicitada]: ${toolCall.tool}`);
      console.log(`[Argumentos]: ${JSON.stringify(toolCall.args, null, 2)}`);

      if (toolCall.tool === "finish_task") {
        console.log(`\n[RESPOSTA FINAL]:\n${toolCall.args?.finalAnswer || 'Concluído'}\n`);
        return; // End the current task loop
      }

      // Human-in-the-Loop check
      if (toolCall.tool === "write_file" || toolCall.tool === "run_command" || toolCall.tool === "replace_in_file") {
        const answer = await promptUser(`\n⚠️ O Agente quer executar a ferramenta perigosa '${toolCall.tool}'. Aprovar? [y/N]: `);
        if (answer.toLowerCase() !== 'y') {
          console.log("[Ação Negada]");
          globalMessages.push({
            role: "user",
            content: `Tool '${toolCall.tool}' failed: User denied permission.`
          });
          saveHistory();
          continue; // Go back to LLM so it knows it failed
        }
      }

      // Execute tool
      console.log(`[Executando...]`);
      const toolResult = await executeTool(toolCall.tool, toolCall.args);
      console.log(`[Status da Ferramenta]:`, toolResult.success ? "SUCESSO" : "ERRO");

      let resultString = JSON.stringify(toolResult);
      if (resultString.length > 3000) {
        resultString = resultString.substring(0, 3000) + "\n\n... [Saída truncada para economizar tokens. Se precisar do resto, refine a busca ou use paginação.]";
      }

      globalMessages.push({
        role: "user",
        content: `Tool '${toolCall.tool}' returned:\n${resultString}`
      });
      saveHistory();

    } else {
      console.log("[Aviso]: Não foi possível extrair a ferramenta. Corrigindo o modelo...");
      globalMessages.push({
        role: "user",
        content: "I could not parse a valid tool call JSON from your response. Please output ONLY the JSON object with 'tool' and 'args' keys."
      });
      saveHistory();
    }
  }

  if (loops >= MAX_ITERATIONS) {
    console.log("Limite máximo de iterações atingido. Abortando.");
  }
}
