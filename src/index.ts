import { Agent } from "./agent";
import { promptUser } from "./promptUser";
import { initLLM } from "./llmClient";

import { select } from '@inquirer/prompts';
import { findLocalManifest, loadManifest } from "./mcp/manifest";
import { MCPClientManager } from "./mcp/client";
import pc from "picocolors";

async function main() {
  console.log(pc.magenta("========================================="));
  console.log(pc.bold(pc.cyan("🤖 Turbo Agent Inicializado (v2)")));
  console.log(pc.magenta("=========================================\n"));
  
  // Usa a configuração do .env diretamente
  initLLM(); 
  console.log(`-> ✅ Selecionado: Configuração do .env (Modelo: ${process.env.LLM_MODEL || 'Claude / Custom'})\n`);

  console.log("Ferramentas ativas: read_file, list_files, write_file, run_command, replace_in_file, etc.");
  console.log("Comandos de chat iterativo ativados.");
  console.log("Digite 'exit' ou 'sair' para encerrar. Digite 'clear' ou 'limpar' para resetar a memória.");
  console.log("=========================================\n");


  // Initialize MCP Tools
  const mcpManifestPath = findLocalManifest();
  const mcpManager = new MCPClientManager();
  if (mcpManifestPath) {
    console.log(`[MCP] Manifest found at ${mcpManifestPath}`);
    const manifest = loadManifest(mcpManifestPath);
    if (manifest && manifest.mcpServers) {
      for (const [name, config] of Object.entries(manifest.mcpServers)) {
        await mcpManager.startServer(name, config);
      }
    }
  } else {
    console.log("[MCP] No manifest found.");
  }

  const agent = new Agent();
  agent.loadHistory();

  while (true) {
    const prompt = await promptUser("Você: ");
    
    if (prompt.trim() === "") continue;
    if (prompt.toLowerCase() === "exit" || prompt.toLowerCase() === "sair") {
      console.log("Encerrando agente...");
      await mcpManager.closeAll();
      break;
    }
    if (prompt.toLowerCase() === "clear" || prompt.toLowerCase() === "limpar") {
      agent.clearHistory();
      continue;
    }
    
    if (prompt.toLowerCase().startsWith("/rewind")) {
      const parts = prompt.split(" ");
      const steps = parts.length > 1 ? parseInt(parts[1]) : 1;
      if (isNaN(steps) || steps <= 0) {
        console.log(pc.red("Uso: /rewind <numero_de_passos>"));
        continue;
      }
      
      console.log(pc.yellow(`⏱️ Voltando no tempo ${steps} passo(s)...`));
      const success = await agent.rewindState(steps);
      if (success) {
         console.log(pc.green("✅ Estado revertido com sucesso! O agente esqueceu os eventos recentes."));
      } else {
         console.log(pc.red("❌ Não foi possível reverter. Histórico insuficiente."));
      }
      continue;
    }

    const result: any = await agent.runStep(prompt);
    
    // Fase 1 HITL: Se pausou, pergunta pro usuário
    if (result && result.status === 'paused') {
      const aprovacao = await promptUser(pc.yellow("⚠️ O Arquiteto montou o plano. Deseja permitir que o Coder execute? (S/N): "));
      if (aprovacao.trim().toLowerCase() === "s") {
         await agent.runStep(null); // Retoma
      } else {
         await agent.abortPlan(); // Cancela
         console.log(pc.red("Plano abortado."));
      }
    }
  }
}

main().catch(console.error);
