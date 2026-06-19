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
  
  const modelOption = await select({
    message: 'Selecione o modelo LLM a ser utilizado:',
    choices: [
      {
        name: '🤖 Usar configurações do .env (Claude Proxy / Custom)',
        value: 'env',
        description: 'Usa a URL, modelo e chave definidos no arquivo .env.',
      },
      {
        name: 'Qwen 3.6 35B TurboQuant',
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
  
  if (modelOption !== 'env') {
    process.env.LLM_MODEL = modelOption;
    // Força o IP do WSL local apenas se escolheu um modelo do Ollama/LMStudio do menu
    initLLM("http://172.24.160.1:18080/v1", "llama.cpp");
    console.log(`-> ✅ Selecionado: ${modelOption}\n`);
  } else {
    initLLM(); // Vai ler tudo do .env
    console.log(`-> ✅ Selecionado: Configuração do .env (Modelo: ${process.env.LLM_MODEL})\n`);
  }

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

    await agent.runStep(prompt);
  }
}

main().catch(console.error);
