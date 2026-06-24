import { getConfig } from "./config";

interface DatadogLog {
  message: string;
  level: string;
  ddsource: string;
  service: string;
  hostname?: string;
  [key: string]: any;
}

export class DatadogDispatcher {
  private static buffer: DatadogLog[] = [];
  private static isFlushing = false;

  public static addLog(level: string, message: string, meta?: any) {
    const config = getConfig();
    if (!config.enableDatadog) return;

    const log: DatadogLog = {
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

  public static async flush() {
    if (this.buffer.length === 0) return;
    const config = getConfig();
    if (!config.enableDatadog) return;

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
          "DD-API-KEY": apiKey as string,
        },
        body: JSON.stringify(logsToSend),
      });
    } catch (e: any) {
      // Falha silenciosa para não quebrar o console do usuário com erros de rede do DD
    } finally {
      this.isFlushing = false;
      if (this.buffer.length > 0) {
        this.flush();
      }
    }
  }
}
