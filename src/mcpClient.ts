import fs from "fs";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolRegistry } from "./tools";
import pc from "picocolors";
import { z } from "zod";
import { agentEvents } from "./agent";

export class MCPManager {
  private static clients: Map<string, Client> = new Map();

  static async init() {
    const configPath = path.resolve(".mcp_servers.json");
    if (!fs.existsSync(configPath)) {
      console.log(pc.yellow("[MCP] No .mcp_servers.json found. Skipping MCP setup."));
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const servers = config.mcpServers || {};

      for (const [serverName, serverConfig] of Object.entries(servers)) {
        await this.connectServer(serverName, serverConfig as any);
      }
    } catch (e: any) {
      console.error(pc.red(`[MCP] Failed to load MCP config: ${e.message}`));
    }
  }

  private static async connectServer(serverName: string, config: { command: string, args?: string[], env?: Record<string, string> }) {
    console.log(pc.cyan(`[MCP] Connecting to server: ${serverName}...`));
    
    try {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...(config.env || {}) } as Record<string, string>
      });

      const client = new Client({
        name: "turbo-agent",
        version: "1.0.0"
      }, {
        capabilities: {}
      });

      await client.connect(transport);
      this.clients.set(serverName, client);

      // Fetch and register tools
      const toolsResponse = await client.listTools();
      const tools = toolsResponse.tools || [];
      
      console.log(pc.green(`[MCP] Server ${serverName} connected! Discovered ${tools.length} tools.`));
      agentEvents.emit("system", `[MCP] Servidor ${serverName} online. ${tools.length} ferramentas injetadas.`);

      for (const mcpTool of tools) {
        const fullToolName = `mcp_${serverName}_${mcpTool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        
        // Registrar no ToolRegistry com zod puro (any) e injetar schema bruto
        ToolRegistry.register({
          name: fullToolName,
          description: mcpTool.description || `MCP Tool from ${serverName}`,
          schema: z.any(),
          execute: async (args: any) => {
             console.log(pc.magenta(`[MCP] Calling ${fullToolName}...`));
             try {
                const response = await client.callTool({
                   name: mcpTool.name,
                   arguments: args
                });
                
                if (response.isError) {
                   return { success: false, error: response.content };
                }

                // Extrair string content
                let finalStr = "";
                for (const c of response.content as any[]) {
                   if (c.type === "text") finalStr += c.text + "\n";
                   else finalStr += `[Content type: ${c.type}]\n`;
                }
                return { success: true, result: finalStr.trim() };
             } catch (err: any) {
                return { success: false, error: err.message };
             }
          }
        });

        // Injetar o schema json bruto para o OpenAI formatador usar
        const registryMap = (ToolRegistry as any).tools as Map<string, any>;
        const registered = registryMap.get(fullToolName);
        if (registered) {
           registered._mcpJsonSchema = mcpTool.inputSchema;
        }
      }

    } catch (e: any) {
      console.error(pc.red(`[MCP] Failed to connect to server ${serverName}: ${e.message}`));
    }
  }

  static getConnectedServers() {
    return Array.from(this.clients.keys());
  }
}
