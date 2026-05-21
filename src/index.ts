import { runAgentStep, loadHistory, clearHistory } from "./agent";
import { promptUser } from "./promptUser";
import { initLLM } from "./llmClient";

import { select } from '@inquirer/prompts';

async function main() {
  console.log("=========================================");
  console.log("🤖 Turbo Agent Inicializado (v2)");
  console.log("=========================================\n");
  
  const modelOption = await select({
    message: 'Selecione o modelo LLM a ser utilizado:',
    choices: [
      {
        name: 'Qwen 3.6 35B TurboQuant (Recomendado)',
        value: 'omniagent',
        description: 'Modelo de uso geral, otimizado para velocidade.',
      },
      {
        name: 'Qwen 2.5 Coder 14B',
        value: 'qwen2.5-coder:14b',
        description: 'Modelo excelente para programação e tarefas rápidas.',
      },
      {
        name: 'QwQ 32B (Raciocínio Avançado)',
        value: 'qwq',
        description: 'Modelo da família Qwen focado em raciocínio complexo.',
      },
    ],
  });
  
  process.env.LLM_MODEL = modelOption;
  initLLM("http://172.24.160.1:18080/v1", "llama.cpp");
  console.log(`-> ✅ Selecionado: ${modelOption === 'qwq' ? 'QwQ 32B' : modelOption === 'omniagent' ? 'Qwen 3.6 35B TurboQuant' : 'Qwen 2.5 Coder 14B'} (via OmniAgent)\n`);

  console.log("Ferramentas ativas: read_file, list_files, write_file, run_command, replace_in_file");
  console.log("Comandos de chat iterativo ativados.");
  console.log("Digite 'exit' ou 'sair' para encerrar. Digite 'clear' ou 'limpar' para resetar a memória.");
  console.log("=========================================\n");


  loadHistory();

  while (true) {
    const prompt = await promptUser("\nVocê: ");
    
    if (prompt.trim() === "") continue;
    if (prompt.toLowerCase() === "exit" || prompt.toLowerCase() === "sair") {
      console.log("Encerrando agente...");
      break;
    }
    if (prompt.toLowerCase() === "clear" || prompt.toLowerCase() === "limpar") {
      clearHistory();
      continue;
    }

    await runAgentStep(prompt);
  }
}

main().catch(console.error);
