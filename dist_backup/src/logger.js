"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const picocolors_1 = __importDefault(require("picocolors"));
const config_1 = require("./config");
const datadog_1 = require("./datadog");
class AgentLogger {
    formatLog(level, message, meta) {
        const config = (0, config_1.getConfig)();
        datadog_1.DatadogDispatcher.addLog(level, message, meta);
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
        }
        else {
            // Text format
            let formattedMsg = message;
            if (level === "debug")
                formattedMsg = picocolors_1.default.gray(`[DEBUG] ${message}`);
            if (level === "info")
                formattedMsg = picocolors_1.default.blue(`[INFO] ${message}`);
            if (level === "warn")
                formattedMsg = picocolors_1.default.yellow(`[WARN] ${message}`);
            if (level === "error")
                formattedMsg = picocolors_1.default.red(`[ERROR] ${message}`);
            if (meta) {
                const metaStr = typeof meta === 'object' ? JSON.stringify(meta, null, 2) : String(meta);
                formattedMsg += `\n${picocolors_1.default.dim(metaStr)}`;
            }
            console.log(formattedMsg);
        }
    }
    debug(message, meta) { this.formatLog("debug", message, meta); }
    info(message, meta) { this.formatLog("info", message, meta); }
    warn(message, meta) { this.formatLog("warn", message, meta); }
    error(message, meta) { this.formatLog("error", message, meta); }
}
exports.Logger = new AgentLogger();
