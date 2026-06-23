"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const agent_1 = require("./agent");
const promptUser_1 = require("./promptUser");
const llmClient_1 = require("./llmClient");
const prompts_1 = require("@inquirer/prompts");
const manifest_1 = require("./mcp/manifest");
const client_1 = require("./mcp/client");
const picocolors_1 = __importDefault(require("picocolors"));
async function main() {
    console.log(picocolors_1.default.magenta("========================================="));
    console.log(picocolors_1.default.bold(picocolors_1.default.cyan("🤖 Turbo Agent Inicializado (v2)")));
    console.log(picocolors_1.default.magenta("=========================================\n"));
    const modelOption = await (0, prompts_1.select)({
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
        (0, llmClient_1.initLLM)("http://172.24.160.1:18080/v1", "llama.cpp");
        console.log(`-> ✅ Selecionado: ${modelOption}\n`);
    }
    else {
        (0, llmClient_1.initLLM)(); // Vai ler tudo do .env
        console.log(`-> ✅ Selecionado: Configuração do .env (Modelo: ${process.env.LLM_MODEL})\n`);
    }
    console.log("Ferramentas ativas: read_file, list_files, write_file, run_command, replace_in_file, etc.");
    console.log("Comandos de chat iterativo ativados.");
    console.log("Digite 'exit' ou 'sair' para encerrar. Digite 'clear' ou 'limpar' para resetar a memória.");
    console.log("=========================================\n");
    // Initialize MCP Tools
    const mcpManifestPath = (0, manifest_1.findLocalManifest)();
    const mcpManager = new client_1.MCPClientManager();
    if (mcpManifestPath) {
        console.log(`[MCP] Manifest found at ${mcpManifestPath}`);
        const manifest = (0, manifest_1.loadManifest)(mcpManifestPath);
        if (manifest && manifest.mcpServers) {
            for (const [name, config] of Object.entries(manifest.mcpServers)) {
                await mcpManager.startServer(name, config);
            }
        }
    }
    else {
        console.log("[MCP] No manifest found.");
    }
    const agent = new agent_1.Agent();
    agent.loadHistory();
    while (true) {
        const prompt = await (0, promptUser_1.promptUser)("Você: ");
        if (prompt.trim() === "")
            continue;
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
                console.log(picocolors_1.default.red("Uso: /rewind <numero_de_passos>"));
                continue;
            }
            console.log(picocolors_1.default.yellow(`⏱️ Voltando no tempo ${steps} passo(s)...`));
            const success = await agent.rewindState(steps);
            if (success) {
                console.log(picocolors_1.default.green("✅ Estado revertido com sucesso! O agente esqueceu os eventos recentes."));
            }
            else {
                console.log(picocolors_1.default.red("❌ Não foi possível reverter. Histórico insuficiente."));
            }
            continue;
        }
        const result = await agent.runStep(prompt);
        // Fase 1 HITL: Se pausou, pergunta pro usuário
        if (result && result.status === 'paused') {
            const aprovacao = await (0, promptUser_1.promptUser)(picocolors_1.default.yellow("⚠️ O Arquiteto montou o plano. Deseja permitir que o Coder execute? (S/N): "));
            if (aprovacao.trim().toLowerCase() === "s") {
                await agent.runStep(null); // Retoma
            }
            else {
                await agent.abortPlan(); // Cancela
                console.log(picocolors_1.default.red("Plano abortado."));
            }
        }
    }
}
main().catch(console.error);
