import "dotenv/config";
import express from "express";
import cors from "cors";
import { Agent, agentEvents } from "./agent";
import { MCPClientManager } from "./mcp/client";
import { findLocalManifest, loadManifest } from "./mcp/manifest";
import { ToolRegistry } from "./tools";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3333;
const agent = new Agent();

app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }
    
    // Dispara a execução de forma assíncrona. O streaming de progresso será no /api/stream
    agent.runStep(message).catch(err => {
        console.error("Agent error:", err);
        agentEvents.emit("error", err.message);
    });
    
    return res.json({ status: "started" });
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
    agentEvents.on("tool_start", onToolStart);
    agentEvents.on("tool_end", onToolEnd);
    agentEvents.on("pause", onPause);
    agentEvents.on("error", onError);
    agentEvents.on("end", onEnd);

    req.on("close", () => {
        agentEvents.off("token", onToken);
        agentEvents.off("system", onSystem);
        agentEvents.off("tool_start", onToolStart);
        agentEvents.off("tool_end", onToolEnd);
        agentEvents.off("pause", onPause);
        agentEvents.off("error", onError);
        agentEvents.off("end", onEnd);
    });
});

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
    
    app.listen(PORT, () => {
        console.log(`🚀 Turbo-Agent Web Studio Server is running on http://localhost:${PORT}`);
    });
}

startServer();
console.log("=== CACHE BUSTER ===");
