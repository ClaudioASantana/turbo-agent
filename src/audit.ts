import * as fs from "fs";
import * as path from "path";
import { getConfig } from "./config";
import sqlite3 from "sqlite3";
import { redactSecretsInText } from "./secretsDetector";

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

let db: sqlite3.Database | null = null;
let _enabled: boolean | null = null;

function isEnabled(): boolean {
  if (_enabled !== null) return _enabled;
  _enabled = getConfig().auditLog;
  return _enabled;
}

function initDb() {
  if (db) return db;
  const dbPath = path.resolve(".agent_audit.db");
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.warn(`[audit] Failed to open audit db: ${err.message}`);
    } else {
      db!.run("PRAGMA journal_mode = WAL;");
      db!.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        type TEXT,
        tool TEXT,
        args TEXT,
        result TEXT,
        message TEXT,
        user TEXT
      )`);
    }
  });
  return db;
}

/**
 * Writes a single audit event to the SQLite database.
 */
export function logAuditEvent(event: AuditEvent): void {
  if (!isEnabled()) return;
  const database = initDb();
  if (!database) return;

  const timestamp = event.timestamp ?? new Date().toISOString();
  const argsStr = event.args ? JSON.stringify(event.args) : null;
  
  database.run(
    `INSERT INTO audit_logs (timestamp, type, tool, args, result, message, user) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [timestamp, event.type, event.tool || null, argsStr, event.result || null, event.message || null, event.user || null],
    (err) => {
      if (err) console.warn(`[audit] Failed to write audit log: ${err.message}`);
    }
  );
}

/**
 * Convenience: log a tool call.
 */
export function auditToolCall(tool: string, args: Record<string, unknown>): void {
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
export function auditToolResult(tool: string, result: string): void {
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
export function auditUserDecision(tool: string, approved: boolean, args?: Record<string, unknown>): void {
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
export function auditSecretDetected(tool: string, patternName: string): void {
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
export function auditPermissionDenied(tool: string, reason: string): void {
  logAuditEvent({
    timestamp: new Date().toISOString(),
    type: "permission_denied",
    tool,
    message: reason,
  });
}

/**
 * Reads the latest audit events from the SQLite database.
 */
export async function readAuditLog(limit: number = 100): Promise<any[]> {
  const database = initDb();
  if (!database) return [];

  return new Promise((resolve, reject) => {
    database.all(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) {
        console.warn(`[audit] Failed to read audit log: ${err.message}`);
        resolve([]);
      } else {
        // Parse args back to JSON if needed
        resolve(rows.map((row: any) => ({
          ...row,
          args: row.args ? JSON.parse(row.args) : undefined
        })));
      }
    });
  });
}

export async function getAuditStats(): Promise<any> {
  const database = initDb();
  if (!database) return { total: 0, errors: 0 };

  return new Promise((resolve) => {
     database.all(`SELECT type, COUNT(*) as count FROM audit_logs GROUP BY type`, [], (err, rows: any) => {
        if (err) {
           resolve({ total: 0, errors: 0 });
           return;
        }
        const stats: any = { total: 0, byType: {} };
        rows.forEach((r: any) => {
           stats.total += r.count;
           stats.byType[r.type] = r.count;
        });
        resolve(stats);
     });
  });
}

/**
 * Removes sensitive values from args before logging.
 */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = /password|secret|token|key|auth|credential|api_key/i;
  const result: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(args)) {
    if (sensitiveKeys.test(k)) {
      result[k] = "[REDACTED]";
    } else if (typeof v === "string") {
      let safeStr = redactSecretsInText(v);
      if (safeStr.length > 200) safeStr = safeStr.slice(0, 200) + "...[truncated]";
      result[k] = safeStr;
    } else {
      result[k] = v;
    }
  }

  return result;
}

export function resetAudit(): void {
  _enabled = null;
  if (db) {
    db.close();
    db = null;
  }
}
