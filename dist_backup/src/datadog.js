"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatadogDispatcher = void 0;
const config_1 = require("./config");
class DatadogDispatcher {
    static buffer = [];
    static isFlushing = false;
    static addLog(level, message, meta) {
        const config = (0, config_1.getConfig)();
        if (!config.enableDatadog)
            return;
        const log = {
            message,
            level,
            ddsource: "turbo-agent",
            service: "turbo-agent",
            hostname: require("os").hostname(),
            ...meta,
        };
        this.buffer.push(log);
        // Flush automatically if buffer gets too big
        if (this.buffer.length >= 10 && !this.isFlushing) {
            this.flush();
        }
    }
    static async flush() {
        if (this.buffer.length === 0)
            return;
        const config = (0, config_1.getConfig)();
        if (!config.enableDatadog)
            return;
        this.isFlushing = true;
        const logsToSend = [...this.buffer];
        this.buffer = [];
        const apiKey = process.env.DD_API_KEY || process.env.DATADOG_API_KEY;
        if (!apiKey) {
            this.isFlushing = false;
            return;
        }
        const site = config.datadogSite || "datadoghq.com";
        const url = `https://http-intake.logs.${site}/api/v2/logs`;
        try {
            await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "DD-API-KEY": apiKey,
                },
                body: JSON.stringify(logsToSend),
            });
        }
        catch (e) {
            // Falha silenciosa para não quebrar o console do usuário com erros de rede do DD
        }
        finally {
            this.isFlushing = false;
            if (this.buffer.length > 0) {
                this.flush();
            }
        }
    }
}
exports.DatadogDispatcher = DatadogDispatcher;
