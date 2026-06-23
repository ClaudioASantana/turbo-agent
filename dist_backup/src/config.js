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
exports.validateEnv = validateEnv;
exports.loadConfig = loadConfig;
exports.getConfig = getConfig;
exports.resetConfig = resetConfig;
exports.createDefaultAgentrc = createDefaultAgentrc;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const ConfigSchema = zod_1.z.object({
    maxIterations: zod_1.z.number().int().positive().optional(),
    maxMessages: zod_1.z.number().int().positive().optional(),
    auditLog: zod_1.z.boolean().optional(),
    auditLogPath: zod_1.z.string().optional(),
    allowedTools: zod_1.z.array(zod_1.z.string()).optional(),
    blockedTools: zod_1.z.array(zod_1.z.string()).optional(),
    requireApprovalFor: zod_1.z.array(zod_1.z.string()).optional(),
    secretsDetection: zod_1.z.boolean().optional(),
    secretsBlockWrite: zod_1.z.boolean().optional(),
    persona: zod_1.z.string().optional(),
    debugMode: zod_1.z.boolean().optional(),
    logFormat: zod_1.z.enum(['text', 'json']).optional(),
    enableDatadog: zod_1.z.boolean().optional(),
    datadogSite: zod_1.z.string().optional(),
});
const DEFAULTS = {
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
let _config = null;
function validateEnv(config) {
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
function loadConfig(cwd = process.cwd()) {
    if (_config)
        return _config;
    const rcPath = path.join(cwd, ".agentrc");
    let parsedConfig = {};
    if (fs.existsSync(rcPath)) {
        try {
            const raw = fs.readFileSync(rcPath, "utf-8");
            parsedConfig = ConfigSchema.parse(JSON.parse(raw));
        }
        catch (err) {
            if (err instanceof zod_1.z.ZodError) {
                const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
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
function getConfig() {
    return _config ?? loadConfig();
}
/**
 * Resets the cached config (useful for tests).
 */
function resetConfig() {
    _config = null;
}
/**
 * Creates a default .agentrc file in the given directory.
 */
function createDefaultAgentrc(cwd = process.cwd()) {
    const rcPath = path.join(cwd, ".agentrc");
    if (fs.existsSync(rcPath)) {
        console.log(`[config] .agentrc already exists at ${rcPath}`);
        return;
    }
    fs.writeFileSync(rcPath, JSON.stringify(DEFAULTS, null, 2) + "\n", "utf-8");
    console.log(`[config] Created default .agentrc at ${rcPath}`);
}
