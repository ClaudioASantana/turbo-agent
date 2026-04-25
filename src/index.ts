import { runAgentStep, loadHistory, clearHistory } from "./agent";
import { promptUser } from "./promptUser";

async function main() {
  console.log("=========================================");
  console.log("🤖 Qwen Local Agent Inicializado (v2)");
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
