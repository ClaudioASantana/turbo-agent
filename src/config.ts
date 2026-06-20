import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

const ConfigSchema = z.object({
  maxIterations: z.number().int().positive().optional(),
  maxMessages: z.number().int().positive().optional(),
  auditLog: z.boolean().optional(),
  auditLogPath: z.string().optional(),
  allowedTools: z.array(z.string()).optional(),
  blockedTools: z.array(z.string()).optional(),
  requireApprovalFor: z.array(z.string()).optional(),
  secretsDetection: z.boolean().optional(),
  secretsBlockWrite: z.boolean().optional(),
  persona: z.string().optional(),
  debugMode: z.boolean().optional(),
  logFormat: z.enum(['text', 'json']).optional(),
  enableDatadog: z.boolean().optional(),
  datadogSite: z.string().optional(),
});

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
  debugMode: boolean;
  logFormat: 'text' | 'json';
  enableDatadog: boolean;
  datadogSite: string;
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
  debugMode: false,
  logFormat: "text",
  enableDatadog: false,
  datadogSite: "datadoghq.com",
};

let _config: AgentConfig | null = null;

export function validateEnv(config?: AgentConfig) {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
     throw new Error("Erro Fatal: Chave de API ausente. Defina OPENAI_API_KEY (ou similar) no seu ambiente.");
  }

  if (config?.enableDatadog) {
     if (!process.env.DD_API_KEY && !process.env.DATADOG_API_KEY) {
        throw new Error("Erro Fatal: Datadog ativado no .agentrc, mas DD_API_KEY não foi encontrada no ambiente.");
     }
  }
}

/**
 * Loads configuration from .agentrc (JSON) in the current working directory.
 * Fails fast if environment variables are missing or syntax is invalid.
 */
export function loadConfig(cwd: string = process.cwd()): AgentConfig {
  if (_config) return _config;

  const rcPath = path.join(cwd, ".agentrc");

  let parsedConfig: Partial<AgentConfig> = {};
  if (fs.existsSync(rcPath)) {
    try {
      const raw = fs.readFileSync(rcPath, "utf-8");
      parsedConfig = ConfigSchema.parse(JSON.parse(raw));
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const issues = err.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`[config] Erro de validação no arquivo .agentrc: ${issues}`);
      }
      throw new Error(`[config] Falha fatal ao ler .agentrc: ${err.message}`);
    }
  }

  _config = { ...DEFAULTS, ...parsedConfig };
  validateEnv(_config);
  return _config;
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
