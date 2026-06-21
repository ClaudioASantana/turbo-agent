import { Agent } from "./src/agent";
import { initLLM } from "./src/llmClient";
import "dotenv/config";

async function run() {
  console.log("-> Inicializando LLM...");
  initLLM(); 
  
  console.log("-> Instanciando Agente...");
  const agent = new Agent(".agent_history_test.json", 5, 10, false, "generic");
  
  console.log("-> Enviando prompt inicial...");
  const result = await agent.runStep("Liste os arquivos do diretório atual usando a ferramenta list_files e depois chame finish_task informando os 3 primeiros arquivos.");
  
  console.log("===============================");
  console.log("Resultado Final:", result);
  console.log("===============================");
}

run().catch((e) => {
  console.error("Erro fatal:", e);
});
