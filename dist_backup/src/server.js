"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const agent_1 = require("./agent");
const client_1 = require("./mcp/client");
const manifest_1 = require("./mcp/manifest");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 3333;
const agent = new agent_1.Agent();
app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }
    // Dispara a execução de forma assíncrona. O streaming de progresso será no /api/stream
    agent.runStep(message).catch(err => {
        console.error("Agent error:", err);
        agent_1.agentEvents.emit("error", err.message);
    });
    return res.json({ status: "started" });
});
app.post("/api/approve", async (req, res) => {
    const { approved } = req.body;
    if (approved) {
        agent_1.agentEvents.emit("system", "✅ Plano Aprovado. Retomando Coder...");
        agent.runStep(null).catch(console.error);
    }
    else {
        agent_1.agentEvents.emit("system", "❌ Plano Rejeitado. Abortando operação...");
        await agent.abortPlan();
    }
    return res.json({ status: "processed" });
});
app.get("/api/stream", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const onToken = (text) => {
        res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`);
    };
    const onSystem = (text) => {
        res.write(`data: ${JSON.stringify({ type: 'system', text })}\n\n`);
    };
    const onToolStart = (toolName) => {
        res.write(`data: ${JSON.stringify({ type: 'tool_start', toolName })}\n\n`);
    };
    const onToolEnd = () => {
        res.write(`data: ${JSON.stringify({ type: 'tool_end' })}\n\n`);
    };
    const onPause = () => {
        res.write(`data: ${JSON.stringify({ type: 'pause' })}\n\n`);
    };
    const onError = (error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
    };
    const onEnd = () => {
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    };
    agent_1.agentEvents.on("token", onToken);
    agent_1.agentEvents.on("system", onSystem);
    agent_1.agentEvents.on("tool_start", onToolStart);
    agent_1.agentEvents.on("tool_end", onToolEnd);
    agent_1.agentEvents.on("pause", onPause);
    agent_1.agentEvents.on("error", onError);
    agent_1.agentEvents.on("end", onEnd);
    req.on("close", () => {
        agent_1.agentEvents.off("token", onToken);
        agent_1.agentEvents.off("system", onSystem);
        agent_1.agentEvents.off("tool_start", onToolStart);
        agent_1.agentEvents.off("tool_end", onToolEnd);
        agent_1.agentEvents.off("pause", onPause);
        agent_1.agentEvents.off("error", onError);
        agent_1.agentEvents.off("end", onEnd);
    });
});
async function startServer() {
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
    app.listen(PORT, () => {
        console.log(`🚀 Turbo-Agent Web Studio Server is running on http://localhost:${PORT}`);
    });
}
startServer();
