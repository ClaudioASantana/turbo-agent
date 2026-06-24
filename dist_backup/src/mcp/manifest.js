"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPManifestSchema = exports.MCPServerConfigSchema = void 0;
exports.loadManifest = loadManifest;
exports.findLocalManifest = findLocalManifest;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
exports.MCPServerConfigSchema = zod_1.z.object({
    command: zod_1.z.string(),
    args: zod_1.z.array(zod_1.z.string()).optional(),
    env: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional()
});
exports.MCPManifestSchema = zod_1.z.object({
    mcpServers: zod_1.z.record(zod_1.z.string(), exports.MCPServerConfigSchema)
});
function loadManifest(filePath) {
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
                return exports.MCPManifestSchema.parse({ mcpServers: projectData.mcpServers });
            }
            // If the current directory is not in projects, or has no mcpServers, return empty
            return { mcpServers: {} };
        }
        return exports.MCPManifestSchema.parse(json);
    }
    catch (e) {
        console.error(`[Error] Failed to parse MCP manifest at ${absolutePath}:`, e);
        return null;
    }
}
function findLocalManifest() {
    const possiblePaths = [
        ".cursor/mcp.json",
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
