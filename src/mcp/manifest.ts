import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional()
});

export const MCPManifestSchema = z.object({
  mcpServers: z.record(z.string(), MCPServerConfigSchema)
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;
export type MCPManifest = z.infer<typeof MCPManifestSchema>;

export function loadManifest(filePath: string): MCPManifest | null {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(absolutePath, "utf-8");
    const json = JSON.parse(content);
    
    // Handle openclaude global config format
    if (json.projects && typeof json.projects === "object") {
      const cwd = process.cwd();
      const projectData = json.projects[cwd];
      if (projectData && projectData.mcpServers) {
        return MCPManifestSchema.parse({ mcpServers: projectData.mcpServers });
      }
      // If the current directory is not in projects, or has no mcpServers, return empty
      return { mcpServers: {} };
    }

    return MCPManifestSchema.parse(json);
  } catch (e) {
    console.error(`[Error] Failed to parse MCP manifest at ${absolutePath}:`, e);
    return null;
  }
}

export function findLocalManifest(): string | null {
  const possiblePaths = [
    ".mcp.json",
    "mcp.json",
    "manifest.json"
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(path.resolve(p))) {
      return path.resolve(p);
    }
  }

  // Also support openclaude's global manifest
  const globalClaudePath = path.join(process.env.HOME || "", ".claude.json");
  if (fs.existsSync(globalClaudePath)) {
    return globalClaudePath;
  }

  return null;
}
