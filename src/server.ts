import "dotenv/config";
import express from "express";
import cors from "cors";
import { agent } from "./server/agentInstance";
import { MCPClientManager } from "./mcp/client";
import { findLocalManifest, loadManifest } from "./mcp/manifest";
import { startTelegramBot } from "./telegram";
import { registerCustomAgents } from "./customAgents";

// Routers
import { chatRouter } from "./server/routes/chat";
import { tasksRouter } from "./server/routes/tasks";
import { auditRouter } from "./server/routes/audit";
import { agentsRouter } from "./server/routes/agents";
import { transcribeRouter } from "./server/routes/transcribe";
import { streamRouter } from "./server/sse";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3333;
process.env.UI_MODE = "true";

// Inicia o Bot do Telegram em segundo plano
startTelegramBot(agent);

// Registra rotas
app.use("/api/chat", chatRouter);
app.use("/api", chatRouter); // para /api/approve e /api/cancel
app.use("/api/tasks", tasksRouter);
app.use("/api/audit", auditRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/transcribe", transcribeRouter);
app.use("/api/stream", streamRouter);



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
