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
exports.grantedPermissions = exports.TOOL_PERMISSIONS = void 0;
exports.getToolPermission = getToolPermission;
exports.checkPermission = checkPermission;
exports.isPermissionGranted = isPermissionGranted;
exports.grantPermission = grantPermission;
exports.describePermissions = describePermissions;
const config_1 = require("./config");
/**
 * Default permission map for all built-in tools.
 */
exports.TOOL_PERMISSIONS = [
    // ── Read-only ──────────────────────────────────────────────────────────────
    {
        tool: "read_file",
        level: "read",
        description: "Reads a file from disk",
        requiresApproval: false,
    },
    {
        tool: "list_files",
        level: "read",
        description: "Lists files in a directory",
        requiresApproval: false,
    },
    {
        tool: "search_files",
        level: "read",
        description: "Searches text across files",
        requiresApproval: false,
    },
    {
        tool: "analyze_codebase",
        level: "read",
        description: "Analyzes code structure",
        requiresApproval: false,
    },
    {
        tool: "semantic_search",
        level: "read",
        description: "Semantic search across codebase",
        requiresApproval: false,
    },
    {
        tool: "read_process_logs",
        level: "read",
        description: "Reads logs of a background process",
        requiresApproval: false,
    },
    {
        tool: "finish_task",
        level: "read",
        description: "Signals task completion",
        requiresApproval: false,
    },
    {
        tool: "request_user_approval",
        level: "read",
        description: "Presents a plan for user approval",
        requiresApproval: false,
    },
    {
        tool: "invoke_subagent",
        level: "read",
        description: "Delegates a task to a subagent",
        requiresApproval: false,
    },
    // ── Network ────────────────────────────────────────────────────────────────
    {
        tool: "web_search",
        level: "network",
        description: "Searches the web via DuckDuckGo",
        requiresApproval: false,
    },
    {
        tool: "fetch_url",
        level: "network",
        description: "Fetches a URL and extracts text",
        requiresApproval: false,
    },
    {
        tool: "capture_screenshot",
        level: "network",
        description: "Opens a URL in a headless browser",
        requiresApproval: false,
    },
    // ── Write ──────────────────────────────────────────────────────────────────
    {
        tool: "write_file",
        level: "write",
        description: "Creates or overwrites a file",
        requiresApproval: true,
    },
    {
        tool: "replace_in_file",
        level: "write",
        description: "Replaces text occurrences in a file",
        requiresApproval: true,
    },
    {
        tool: "patch_file",
        level: "write",
        description: "Replaces a range of lines in a file",
        requiresApproval: true,
    },
    {
        tool: "multi_replace_in_file",
        level: "write",
        description: "Replaces multiple non-contiguous line ranges in a file",
        requiresApproval: true,
    },
    // ── Execute ────────────────────────────────────────────────────────────────
    {
        tool: "run_command",
        level: "execute",
        description: "Executes a shell command",
        requiresApproval: true,
    },
    {
        tool: "start_background_command",
        level: "execute",
        description: "Starts a background process",
        requiresApproval: true,
    },
    {
        tool: "stop_background_process",
        level: "execute",
        description: "Stops a background process",
        requiresApproval: false,
    },
    {
        tool: "run_sandboxed_command",
        level: "execute",
        description: "Runs a command in a Docker container",
        requiresApproval: true,
    },
    {
        tool: "create_artifact",
        level: "write",
        description: "Creates a markdown artifact on disk",
        requiresApproval: false,
    },
    {
        tool: "memorize",
        level: "write",
        description: "Saves a rule or preference to long term memory",
        requiresApproval: false,
    },
    {
        tool: "browser_navigate",
        level: "read",
        description: "Navigates browser to URL",
        requiresApproval: false,
    },
    {
        tool: "browser_click",
        level: "execute",
        description: "Clicks element in browser",
        requiresApproval: false,
    },
    {
        tool: "browser_type",
        level: "execute",
        description: "Types text in browser",
        requiresApproval: false,
    },
    {
        tool: "browser_extract",
        level: "read",
        description: "Extracts DOM and screenshot",
        requiresApproval: false,
    },
    {
        tool: "invoke_browser_subagent",
        level: "execute",
        description: "Invokes a subagent for QA",
        requiresApproval: true,
    },
    // ── Dangerous ──────────────────────────────────────────────────────────────
    {
        tool: "create_pull_request",
        level: "dangerous",
        description: "Creates a Git branch and opens a PR",
        requiresApproval: true,
    },
];
/** Lookup map for O(1) access */
const _permissionMap = new Map(exports.TOOL_PERMISSIONS.map((p) => [p.tool, p]));
/**
 * Returns the permission descriptor for a tool.
 * Unknown tools default to 'dangerous' and require approval.
 */
function getToolPermission(toolName) {
    return (_permissionMap.get(toolName) ?? {
        tool: toolName,
        level: "dangerous",
        description: "Unknown tool",
        requiresApproval: true,
    });
}
/**
 * Checks whether a tool is allowed to run based on the current config.
 *
 * Rules (in order):
 * 1. If `blockedTools` contains the tool → denied.
 * 2. If `allowedTools` is non-empty and does NOT contain the tool → denied.
 * 3. Otherwise → allowed (approval flag comes from the tool's own descriptor
 *    OR from `requireApprovalFor` in config).
 */
function checkPermission(toolName) {
    const config = (0, config_1.getConfig)();
    const perm = getToolPermission(toolName);
    // Rule 1: explicit block list
    if (config.blockedTools.includes(toolName)) {
        return {
            allowed: false,
            reason: `Tool "${toolName}" is in the blockedTools list (.agentrc).`,
            requiresApproval: false,
        };
    }
    // Rule 2: explicit allow list (if non-empty, acts as whitelist)
    if (config.allowedTools.length > 0 &&
        !config.allowedTools.includes(toolName)) {
        return {
            allowed: false,
            reason: `Tool "${toolName}" is not in the allowedTools whitelist (.agentrc).`,
            requiresApproval: false,
        };
    }
    // Rule 3: allowed — determine if approval is needed
    const needsApproval = perm.requiresApproval || config.requireApprovalFor.includes(toolName);
    return {
        allowed: true,
        requiresApproval: needsApproval,
    };
}
const path = __importStar(require("path"));
exports.grantedPermissions = [];
function isPermissionGranted(toolName, args) {
    // Check if tool is unconditionally granted
    if (exports.grantedPermissions.some(p => p.tool === toolName && !p.target))
        return true;
    // Check target-based grant
    const target = args?.file || args?.targetFile || args?.path;
    if (!target)
        return false;
    const absoluteTarget = path.resolve(target);
    return exports.grantedPermissions.some(p => {
        if (p.tool !== toolName)
            return false;
        if (!p.target)
            return true;
        if (p.isDirectory) {
            return absoluteTarget.startsWith(p.target);
        }
        else {
            return absoluteTarget === p.target;
        }
    });
}
function grantPermission(toolName, target, isDirectory = false) {
    if (target) {
        exports.grantedPermissions.push({ tool: toolName, target: path.resolve(target), isDirectory });
    }
    else {
        exports.grantedPermissions.push({ tool: toolName });
    }
}
/**
 * Returns a human-readable summary of all tool permissions.
 */
function describePermissions() {
    const levels = ["read", "network", "write", "execute", "dangerous"];
    const lines = ["Tool Permission Map:", ""];
    for (const level of levels) {
        const tools = exports.TOOL_PERMISSIONS.filter((p) => p.level === level);
        if (tools.length === 0)
            continue;
        lines.push(`  [${level.toUpperCase()}]`);
        for (const t of tools) {
            const approval = t.requiresApproval ? " ✋ requires approval" : "";
            lines.push(`    • ${t.tool}${approval}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
