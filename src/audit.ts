import * as fs from "fs";
import * as path from "path";
import { getConfig } from "./config";

export type AuditEventType =
  | "tool_call"
  | "tool_result"
  | "user_approval"
  | "user_denial"
  | "secret_detected"
  | "permission_denied"
  | "agent_start"
  | "agent_end"
  | "error";

export interface AuditEvent {
  timestamp: string;
  type: AuditEventType;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  message?: string;
  user?: string;
}

let _logPath: string | null = null;
let _enabled: boolean | null = null;

function getLogPath(): string {
  if (_logPath) return _logPath;
  const config = getConfig();
  _logPath = path.isAbsolute(config.auditLogPath)
    ? config.auditLogPath
    : path.join(process.cwd(), config.auditLogPath);
  return _logPath;
}

function isEnabled(): boolean {
  if (_enabled !== null) return _enabled;
  _enabled = getConfig().auditLog;
  return _enabled;
}

/**
 * Writes a single audit event as a JSON line to the audit log file.
 */
export function logAuditEvent(event: AuditEvent): void {
  if (!isEnabled()) return;

  const entry: AuditEvent = {
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  try {
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(getLogPath(), line, "utf-8");
  } catch (err) {
    // Never crash the agent due to audit log failures
    console.warn(`[audit] Failed to write audit log: ${(err as Error).message}`);
  }
}

/**
 * Convenience: log a tool call.
 */
export function auditToolCall(
  tool: string,
  args: Record<string, unknown>
): void {
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
export function auditToolResult(
  tool: string,
  result: string
): void {
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
export function auditUserDecision(
  tool: string,
  approved: boolean,
  args?: Record<string, unknown>
): void {
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
export function auditSecretDetected(
  tool: string,
  patternName: string
): void {
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
export function auditPermissionDenied(
  tool: string,
  reason: string
): void {
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
export function readAuditLog(): AuditEvent[] {
  const logPath = getLogPath();
  if (!fs.existsSync(logPath)) return [];

  try {
    const content = fs.readFileSync(logPath, "utf-8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AuditEvent);
  } catch (err) {
    console.warn(`[audit] Failed to read audit log: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Removes sensitive values from args before logging.
 * Replaces values of keys that look like secrets with "[REDACTED]".
 */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = /password|secret|token|key|auth|credential|api_key/i;
  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(args)) {
    if (sensitiveKeys.test(k)) {
      result[k] = "[REDACTED]";
    } else if (typeof v === "string" && v.length > 200) {
      result[k] = v.slice(0, 200) + "...[truncated]";
    } else {
      result[k] = v;
    }
  }

  return result;
}

/**
 * Resets internal state (useful for tests).
 */
export function resetAudit(): void {
  _logPath = null;
  _enabled = null;
}
