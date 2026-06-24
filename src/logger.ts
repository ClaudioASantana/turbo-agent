import pc from "picocolors";
import { getConfig } from "./config";
import { DatadogDispatcher } from "./datadog";

type LogLevel = "debug" | "info" | "warn" | "error";

class AgentLogger {
  private formatLog(level: LogLevel, message: string, meta?: any): void {
    const config = getConfig();

    DatadogDispatcher.addLog(level, message, meta);

    if (level === "debug" && !config.debugMode) {
      return; // Skip debug logs if not in debug mode
    }

    if (config.logFormat === "json") {
      const payload = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...(meta ? { meta } : {})
      };
      // For JSON format, we output raw strings without colors
      process.stdout.write(JSON.stringify(payload) + "\n");
    } else {
      // Text format
      let formattedMsg = message;
      if (level === "debug") formattedMsg = pc.gray(`[DEBUG] ${message}`);
      if (level === "info") formattedMsg = pc.blue(`[INFO] ${message}`);
      if (level === "warn") formattedMsg = pc.yellow(`[WARN] ${message}`);
      if (level === "error") formattedMsg = pc.red(`[ERROR] ${message}`);

      if (meta) {
        const metaStr = typeof meta === 'object' ? JSON.stringify(meta, null, 2) : String(meta);
        formattedMsg += `\n${pc.dim(metaStr)}`;
      }

      console.log(formattedMsg);
    }
  }

  debug(message: string, meta?: any) { this.formatLog("debug", message, meta); }
  info(message: string, meta?: any) { this.formatLog("info", message, meta); }
  warn(message: string, meta?: any) { this.formatLog("warn", message, meta); }
  error(message: string, meta?: any) { this.formatLog("error", message, meta); }
}

export const Logger = new AgentLogger();
