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
exports.logAuditEvent = logAuditEvent;
exports.auditToolCall = auditToolCall;
exports.auditToolResult = auditToolResult;
exports.auditUserDecision = auditUserDecision;
exports.auditSecretDetected = auditSecretDetected;
exports.auditPermissionDenied = auditPermissionDenied;
exports.readAuditLog = readAuditLog;
exports.resetAudit = resetAudit;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("./config");
let _logPath = null;
let _enabled = null;
function getLogPath() {
    if (_logPath)
        return _logPath;
    const config = (0, config_1.getConfig)();
    _logPath = path.isAbsolute(config.auditLogPath)
        ? config.auditLogPath
        : path.join(process.cwd(), config.auditLogPath);
    return _logPath;
}
function isEnabled() {
    if (_enabled !== null)
        return _enabled;
    _enabled = (0, config_1.getConfig)().auditLog;
    return _enabled;
}
/**
 * Writes a single audit event as a JSON line to the audit log file.
 */
function logAuditEvent(event) {
    if (!isEnabled())
        return;
    const entry = {
        ...event,
        timestamp: event.timestamp ?? new Date().toISOString(),
    };
    try {
        const line = JSON.stringify(entry) + "\n";
        fs.appendFileSync(getLogPath(), line, "utf-8");
    }
    catch (err) {
        // Never crash the agent due to audit log failures
        console.warn(`[audit] Failed to write audit log: ${err.message}`);
    }
}
/**
 * Convenience: log a tool call.
 */
function auditToolCall(tool, args) {
    logAuditEvent({
        timestamp: new Date().toISOString(),
        type: "tool_call",
        tool,
        args: sanitizeArgs(args),
    });
}
/**
 * Convenience: log a tool result (truncated to 500 chars).
 */
function auditToolResult(tool, result) {
    logAuditEvent({
        timestamp: new Date().toISOString(),
        type: "tool_result",
        tool,
        result: result.length > 500 ? result.slice(0, 500) + "...[truncated]" : result,
    });
}
/**
 * Convenience: log a user approval or denial.
 */
function auditUserDecision(tool, approved, args) {
    logAuditEvent({
        timestamp: new Date().toISOString(),
        type: approved ? "user_approval" : "user_denial",
        tool,
        args: args ? sanitizeArgs(args) : undefined,
    });
}
/**
 * Convenience: log a detected secret.
 */
function auditSecretDetected(tool, patternName) {
    logAuditEvent({
        timestamp: new Date().toISOString(),
        type: "secret_detected",
        tool,
        message: `Secret pattern detected: ${patternName}`,
    });
}
/**
 * Convenience: log a permission denial.
 */
function auditPermissionDenied(tool, reason) {
    logAuditEvent({
        timestamp: new Date().toISOString(),
        type: "permission_denied",
        tool,
        message: reason,
    });
}
/**
 * Reads all audit events from the log file.
 */
function readAuditLog() {
    const logPath = getLogPath();
    if (!fs.existsSync(logPath))
        return [];
    try {
        const content = fs.readFileSync(logPath, "utf-8");
        return content
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .map((line) => JSON.parse(line));
    }
    catch (err) {
        console.warn(`[audit] Failed to read audit log: ${err.message}`);
        return [];
    }
}
/**
 * Removes sensitive values from args before logging.
 * Replaces values of keys that look like secrets with "[REDACTED]".
 */
function sanitizeArgs(args) {
    const sensitiveKeys = /password|secret|token|key|auth|credential|api_key/i;
    const result = {};
    for (const [k, v] of Object.entries(args)) {
        if (sensitiveKeys.test(k)) {
            result[k] = "[REDACTED]";
        }
        else if (typeof v === "string" && v.length > 200) {
            result[k] = v.slice(0, 200) + "...[truncated]";
        }
        else {
            result[k] = v;
        }
    }
    return result;
}
/**
 * Resets internal state (useful for tests).
 */
function resetAudit() {
    _logPath = null;
    _enabled = null;
}
