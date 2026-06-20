import * as fs from "fs";
import * as path from "path";

export interface AgentConfig {
  maxIterations: number;
  maxMessages: number;
  auditLog: boolean;
  auditLogPath: string;
  allowedTools: string[];
  blockedTools: string[];
  requireApprovalFor: string[];
  secretsDetection: boolean;
  secretsBlockWrite: boolean;
  persona: string;
}

const DEFAULTS: AgentConfig = {
  maxIterations: 256,
  maxMessages: 20,
  auditLog: true,
  auditLogPath: ".agent_audit.log",
  allowedTools: [],
  blockedTools: [],
  requireApprovalFor: [
    "write_file",
    "run_command",
    "patch_file",
    "replace_in_file",
    "start_background_command",
    "create_pull_request",
  ],
  secretsDetection: true,
  secretsBlockWrite: false,
  persona: "generic",
};

let _config: AgentConfig | null = null;

/**
 * Loads configuration from .agentrc (JSON) in the current working directory.
 * Falls back to defaults for any missing field.
 */
export function loadConfig(cwd: string = process.cwd()): AgentConfig {
  if (_config) return _config;

  const rcPath = path.join(cwd, ".agentrc");

  if (!fs.existsSync(rcPath)) {
    _config = { ...DEFAULTS };
    return _config;
  }

  try {
    const raw = fs.readFileSync(rcPath, "utf-8");
    const parsed = JSON.parse(raw);
    _config = { ...DEFAULTS, ...parsed };
    return _config;
  } catch (err) {
    console.warn(`[config] Failed to parse .agentrc: ${(err as Error).message}. Using defaults.`);
    _config = { ...DEFAULTS };
    return _config;
  }
}

/**
 * Returns the current config (loads if not yet loaded).
 */
export function getConfig(): AgentConfig {
  return _config ?? loadConfig();
}

/**
 * Resets the cached config (useful for tests).
 */
export function resetConfig(): void {
  _config = null;
}

/**
 * Creates a default .agentrc file in the given directory.
 */
export function createDefaultAgentrc(cwd: string = process.cwd()): void {
  const rcPath = path.join(cwd, ".agentrc");
  if (fs.existsSync(rcPath)) {
    console.log(`[config] .agentrc already exists at ${rcPath}`);
    return;
  }
  fs.writeFileSync(rcPath, JSON.stringify(DEFAULTS, null, 2) + "\n", "utf-8");
  console.log(`[config] Created default .agentrc at ${rcPath}`);
}
