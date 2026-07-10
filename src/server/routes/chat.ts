import { Router } from "express";
import { agent, agentEvents } from "../agentInstance";

export const chatRouter = Router();

chatRouter.post("/chat", async (req, res) => {
    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: "No prompt provided" });

    let finalPrompt = prompt;

    if (finalPrompt.trim().startsWith("/rewind ")) {
        const stepsStr = finalPrompt.replace(/^\/rewind\s+/, "").trim();
        const steps = parseInt(stepsStr, 10);
        if (!isNaN(steps) && steps > 0) {
            agentEvents.emit("system", `\n⏳ Rebobinando o tempo em ${steps} passos...\n`);
            try {
                const success = await agent.rewindState(steps);
                if (success) {
                    agentEvents.emit("system", `✅ Tempo rebobinado com sucesso! O estado anterior foi restaurado.\n`);
                } else {
                    agentEvents.emit("system", `❌ Falha ao rebobinar o tempo. Você não tem passos suficientes no histórico desta thread.\n`);
                }
            } catch (err: any) {
                agentEvents.emit("error", `Erro no rewind: ${err.message}`);
            }
            agentEvents.emit("end");
            return res.json({ status: "processed" });
        }
    }

    if (context && context.activeFile) {
        finalPrompt += `\n\n<ADDITIONAL_METADATA>\n[SYSTEM_EPHEMERAL] O usuário está atualmente com o seguinte arquivo aberto no editor: ${context.activeFile}\n</ADDITIONAL_METADATA>`;
    }

    if (context && context.workspacePath && context.workspacePath !== process.cwd()) {
        try {
            const { AgentTerminal } = require("../../terminal");
            AgentTerminal.reinitialize(context.workspacePath);
            console.log(`[Context] Workspace do terminal atualizado para: ${context.workspacePath} e Docker reiniciado.`);
        } catch (err) {
            console.error(`[Context] Falha ao mudar diretório para ${context.workspacePath}:`, err);
        }
    }
    
    agentEvents.emit("system", "🚀 Roteando requisição para LangGraph...");
    
    agent.runStep(finalPrompt).catch(err => {
        console.error("Agent error:", err);
        agentEvents.emit("error", err.message);
    });
    
    return res.json({ status: "processing" });
});

chatRouter.post("/approve", async (req, res) => {
    const { approved } = req.body;
    
    if (approved) {
        agentEvents.emit("system", "✅ Plano Aprovado. Retomando Coder...");
        agent.runStep(null).catch(console.error);
    } else {
        agentEvents.emit("system", "❌ Plano Rejeitado. Abortando operação...");
        await agent.abortPlan();
    }
    
    return res.json({ status: "processed" });
});

chatRouter.post("/cancel", async (req, res) => {
    await agent.cancel();
    return res.json({ status: "cancelled" });
});
