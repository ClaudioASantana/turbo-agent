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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityManager = void 0;
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("./config");
const permissions_1 = require("./permissions");
const secretsDetector_1 = require("./secretsDetector");
const audit_1 = require("./audit");
class SecurityManager {
    /**
     * Evaluates a tool call for permissions and secret detection.
     * Prompts the user if approval is required.
     */
    static async authorize(toolName, args, isSubagent) {
        const permCheck = (0, permissions_1.checkPermission)(toolName);
        if (!permCheck.allowed) {
            if (!isSubagent)
                console.log(picocolors_1.default.red(`\n[Bloqueado] ${permCheck.reason}`));
            (0, audit_1.auditPermissionDenied)(toolName, permCheck.reason || "Blocked by config");
            return {
                approved: false,
                reason: "PERMISSION_DENIED",
                userMessage: `Tool '${toolName}' failed: [PERMISSION_DENIED] ${permCheck.reason}`
            };
        }
        if (permCheck.requiresApproval) {
            if (isSubagent) {
                return {
                    approved: false,
                    reason: "SUBAGENT_DENIED",
                    userMessage: `Tool '${toolName}' failed: Subagents are NOT allowed to use tools that require approval.`
                };
            }
            // Secrets detection before approval
            const argsString = JSON.stringify(args || {});
            if ((0, config_1.getConfig)().secretsDetection && (0, secretsDetector_1.hasSecrets)(argsString)) {
                const secrets = (0, secretsDetector_1.detectSecrets)(argsString);
                const warning = (0, secretsDetector_1.formatSecretsWarning)(secrets);
                console.log(picocolors_1.default.red(`\n${warning}`));
                (0, audit_1.auditSecretDetected)(toolName, secrets.map(s => s.patternName).join(", "));
                if ((0, config_1.getConfig)().secretsBlockWrite) {
                    console.log(picocolors_1.default.red("[Bloqueado] Operação cancelada devido à detecção de credenciais."));
                    return {
                        approved: false,
                        reason: "SECRETS_DETECTED",
                        userMessage: `Tool '${toolName}' failed: [PERMISSION_DENIED] Secrets detected in arguments. Config blocks writing secrets.`
                    };
                }
            }
            // Verifica se já temos uma permissão concedida no cache
            const { isPermissionGranted } = await Promise.resolve().then(() => __importStar(require("./permissions")));
            let approved = isPermissionGranted(toolName, args);
            if (!approved) {
                const { requestToolPermission } = await Promise.resolve().then(() => __importStar(require("./promptUser")));
                approved = await requestToolPermission(toolName, args);
            }
            (0, audit_1.auditUserDecision)(toolName, approved, args);
            if (!approved) {
                console.log(picocolors_1.default.yellow("[Ação Negada]"));
                return {
                    approved: false,
                    reason: "USER_DENIED",
                    userMessage: `Tool '${toolName}' failed: User denied permission.`
                };
            }
        }
        return { approved: true };
    }
}
exports.SecurityManager = SecurityManager;
