import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Agent, agentEvents } from "./agent";
import { MCPClientManager } from "./mcp/client";
import { findLocalManifest, loadManifest } from "./mcp/manifest";
import { ToolRegistry } from "./tools";
import { openai } from "./llmClient";
import { startTelegramBot } from "./telegram";

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: os.tmpdir() });

const PORT = process.env.PORT || 3333;
process.env.UI_MODE = "true";
const agent = new Agent();

// Inicia o Bot do Telegram em segundo plano
startTelegramBot(agent);

app.post("/api/chat", async (req, res) => {
    const { prompt, context } = req.body;
    if (!prompt) return res.status(400).json({ error: "No prompt provided" });

    // Injeção de Sistema Efêmera
    let finalPrompt = prompt;

    // Time Travel Interceptor
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
            process.chdir(context.workspacePath);
            console.log(`[Context] Workspace atualizado para: ${context.workspacePath}`);
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

app.post("/api/approve", async (req, res) => {
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

app.post("/api/cancel", async (req, res) => {
    await agent.cancel();
    return res.json({ status: "cancelled" });
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio file provided" });
        }
        
        const originalName = req.file.originalname || "audio.webm";
        const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}_${originalName}`);
        
        fs.renameSync(req.file.path, tempFilePath);
        
        const response = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
        });
        
        fs.unlinkSync(tempFilePath);
        
        return res.json({ text: response.text });
    } catch (error: any) {
        console.error("Transcription error:", error);
        return res.status(500).json({ error: error.message });
    }
});

// --- Background Tasks Endpoints ---
import { backgroundProcesses } from "./tools";

app.get("/api/tasks", (req, res) => {
    const tasks = Object.keys(backgroundProcesses).map(id => ({
        id,
        command: backgroundProcesses[id].command,
        status: backgroundProcesses[id].status
    }));
    return res.json({ tasks });
});

app.get("/api/tasks/:id/logs", (req, res) => {
    const { id } = req.params;
    const proc = backgroundProcesses[id];
    if (!proc) return res.status(404).json({ error: "Task not found" });
    return res.json({ logs: proc.logs });
});

app.delete("/api/tasks/:id", (req, res) => {
    const { id } = req.params;
    const proc = backgroundProcesses[id];
    if (!proc) return res.status(404).json({ error: "Task not found" });
    if (proc.status === "running") {
        proc.process.kill();
        proc.status = "killed";
    }
    delete backgroundProcesses[id];
    return res.json({ status: "deleted" });
});

// --- Audit Dashboard Endpoint ---
import { readAuditLog, getAuditStats } from "./audit";

app.get("/api/audit", async (req, res) => {
    try {
        const logs = await readAuditLog(200);
        const stats = await getAuditStats();
        return res.json({ logs, stats });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});
// ----------------------------------

app.get("/api/stream", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onToken = (text: string) => {
        res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`);
    };

    const onSystem = (text: string) => {
        res.write(`data: ${JSON.stringify({ type: 'system', text })}\n\n`);
    };

    const onToolStart = (toolName: string) => {
        res.write(`data: ${JSON.stringify({ type: 'tool_start', toolName })}\n\n`);
    };

    const onOpenArtifact = (filePath: string) => {
        res.write(`data: ${JSON.stringify({ type: 'open_artifact', filePath })}\n\n`);
    };

    const onOpenDiff = (data: { originalPath: string, proposedPath: string }) => {
        res.write(`data: ${JSON.stringify({ type: 'open_diff', ...data })}\n\n`);
    };

    const onToolEnd = () => {
        res.write(`data: ${JSON.stringify({ type: 'tool_end' })}\n\n`);
    };

    const onPause = () => {
        res.write(`data: ${JSON.stringify({ type: 'pause' })}\n\n`);
    };

    const onError = (error: string) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
    };

    const onEnd = () => {
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    };

    agentEvents.on("token", onToken);
    agentEvents.on("system", onSystem);
    agentEvents.on("open_artifact", onOpenArtifact);
    agentEvents.on("open_diff", onOpenDiff);
    agentEvents.on("tool_start", onToolStart);
    agentEvents.on("tool_end", onToolEnd);
    agentEvents.on("pause", onPause);
    agentEvents.on("error", onError);
    agentEvents.on("end", onEnd);

    req.on("close", () => {
        agentEvents.off("token", onToken);
        agentEvents.off("system", onSystem);
        agentEvents.off("open_artifact", onOpenArtifact);
        agentEvents.off("open_diff", onOpenDiff);
        agentEvents.off("tool_start", onToolStart);
        agentEvents.off("tool_end", onToolEnd);
        agentEvents.off("pause", onPause);
        agentEvents.off("error", onError);
        agentEvents.off("end", onEnd);
    });
});

// --- Custom Agents Endpoints ---
import { loadCustomAgents, saveCustomAgents, registerCustomAgents } from "./customAgents";

app.get("/api/agents", (req, res) => {
    res.json(loadCustomAgents());
});

app.post("/api/agents", async (req, res) => {
    const agents = loadCustomAgents();
    const newAgent = req.body;
    if (!newAgent.id) newAgent.id = Date.now().toString();
    
    // update or push
    const idx = agents.findIndex(a => a.id === newAgent.id);
    if (idx >= 0) agents[idx] = newAgent;
    else agents.push(newAgent);
    
    saveCustomAgents(agents);
    await registerCustomAgents(); // Dynamically re-register tools!
    res.json({ status: "success", agent: newAgent });
});

app.delete("/api/agents/:id", (req, res) => {
    let agents = loadCustomAgents();
    agents = agents.filter(a => a.id !== req.params.id);
    saveCustomAgents(agents);
    
    // Note: Re-registering doesn't automatically remove deleted tools from the registry 
    // without a registry reset, but it's acceptable for this MVP to just restart to fully drop.
    res.json({ status: "success" });
});
// ----------------------------------

async function startServer() {
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
    
    await registerCustomAgents();
    console.log("[Agents] Custom agents registered into tools.");
    
    app.listen(PORT, () => {
        console.log(`🚀 Turbo-Agent Web Studio Server is running on http://localhost:${PORT}`);
    });
}

startServer();
console.log("=== CACHE BUSTER ===");
