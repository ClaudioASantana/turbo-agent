import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolRegistry } from "../tools";
import { z } from "zod";
import { MCPServerConfig } from "./manifest";

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();

  async startServer(name: string, config: MCPServerConfig) {
    console.log(`[MCP] Starting server '${name}' with command: ${config.command} ${config.args?.join(" ") || ""}`);
    
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: config.env ? { ...process.env, ...config.env } as any : undefined,
    });

    const client = new Client(
      {
        name: "turbo-agent",
        version: "1.0.0",
      },
      {
        capabilities: {}
      }
    );

    try {
      await client.connect(transport);
      this.clients.set(name, client);
      console.log(`[MCP] Connected to server '${name}'`);
      
      // Load and register tools
      const toolsResponse = await client.listTools();
      const tools = toolsResponse.tools || [];
      
      console.log(`[MCP] Server '${name}' exposes ${tools.length} tools.`);
      
      for (const mcpTool of tools) {
        // We dynamically create a generic Zod schema that accepts any object 
        // to pass directly to the MCP server. We also store the original JSON schema 
        // to return in getSchemas() so the LLM knows the exact arguments.
        const dynamicSchema = z.any().describe(mcpTool.description || "MCP Tool parameters");

        ToolRegistry.register({
          name: mcpTool.name,
          description: mcpTool.description || `Tool from MCP server ${name}`,
          schema: dynamicSchema,
          // Store the original JSON Schema inside the tool definition 
          // so we can intercept it in ToolRegistry.getSchemas()
          _mcpJsonSchema: mcpTool.inputSchema,
          execute: async (args: any) => {
            console.log(`[MCP] Executing tool '${mcpTool.name}' on server '${name}'`);
            try {
              const result = await client.callTool({
                name: mcpTool.name,
                arguments: args,
              });
              
              if ('content' in result && Array.isArray(result.content)) {
                // Return text contents concatenated
                return {
                  success: !result.isError,
                  content: result.content
                    .filter(c => c.type === "text")
                    .map(c => (c as any).text)
                    .join("\n")
                };
              }
              
              return { success: true, result };
            } catch (error: any) {
              return { success: false, error: error.message || String(error) };
            }
          }
        } as any);
      }
    } catch (e: any) {
      console.error(`[MCP] Failed to connect to server '${name}':`, e);
    }
  }

  async closeAll() {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
        console.log(`[MCP] Closed server '${name}'`);
      } catch (e) {
        // Ignore
      }
    }
    this.clients.clear();
  }
}
