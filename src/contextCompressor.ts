/**
 * Context Compression Manager
 * Intelligently compresses conversation history based on token count
 * not just message count
 */

import { HistoryManager } from "./historyManager";
import { TokenCounter, getTokenCounter } from "./tokenCounter";
import { summarizeMessages } from "./memory";
import { Logger } from "./logger";
import pc from "picocolors";
import ora from "ora";
import { getConfig } from "./config";

export interface CompressionStats {
  beforeTokens: number;
  afterTokens: number;
  messagesBefore: number;
  messagesAfter: number;
  compressionRatio: number; // afterTokens / beforeTokens
  timeMs: number;
}

export interface CompressionReport {
  triggered: boolean;
  reason?: "threshold_reached" | "critical" | "threshold_warning";
  currentTokens: number;
  compressionThreshold: number;
  availableTokens: number;
  stats?: CompressionStats;
}

export class ContextCompressor {
  private historyManager: HistoryManager;
  private tokenCounter: TokenCounter;
  private compressionThresholdPercent: number = 0.5; // Compress at 50% of context window
  private criticalThresholdPercent: number = 0.9; // Emergency compress at 90%
  private debugMode: boolean;

  constructor(historyManager: HistoryManager, modelName?: string) {
    this.historyManager = historyManager;
    this.tokenCounter = getTokenCounter() || new TokenCounter(modelName);
    this.debugMode = getConfig().debugMode ?? false;
  }

  /**
   * Analyze current context usage
   */
  analyzeContext(): {
    totalTokens: number;
    contextWindow: number;
    usagePercentage: number;
    threshold: number;
    critical: number;
    status: "safe" | "warning" | "critical";
  } {
    const messages = this.historyManager.messages;
    const totalTokens = this.tokenCounter.countMessagesTokens(messages);
    const contextWindow = this.tokenCounter.getContextWindowSize();
    const threshold = this.tokenCounter.getCompressionThreshold(
      this.compressionThresholdPercent
    );
    const critical = this.tokenCounter.getCompressionThreshold(
      this.criticalThresholdPercent
    );

    const usagePercentage = (totalTokens / contextWindow) * 100;
    let status: "safe" | "warning" | "critical" = "safe";
    if (totalTokens >= critical) {
      status = "critical";
    } else if (totalTokens >= threshold) {
      status = "warning";
    }

    return {
      totalTokens,
      contextWindow,
      usagePercentage,
      threshold,
      critical,
      status,
    };
  }

  /**
   * Check if compression is needed
   */
  shouldCompress(): CompressionReport {
    const analysis = this.analyzeContext();

    if (analysis.status === "critical") {
      return {
        triggered: true,
        reason: "critical",
        currentTokens: analysis.totalTokens,
        compressionThreshold: analysis.threshold,
        availableTokens: this.tokenCounter.getAvailableTokens(
          analysis.totalTokens
        ),
      };
    }

    if (analysis.status === "warning") {
      return {
        triggered: true,
        reason: "threshold_reached",
        currentTokens: analysis.totalTokens,
        compressionThreshold: analysis.threshold,
        availableTokens: this.tokenCounter.getAvailableTokens(
          analysis.totalTokens
        ),
      };
    }

    if (analysis.usagePercentage > 30) {
      return {
        triggered: false,
        reason: "threshold_warning",
        currentTokens: analysis.totalTokens,
        compressionThreshold: analysis.threshold,
        availableTokens: this.tokenCounter.getAvailableTokens(
          analysis.totalTokens
        ),
      };
    }

    return {
      triggered: false,
      currentTokens: analysis.totalTokens,
      compressionThreshold: analysis.threshold,
      availableTokens: this.tokenCounter.getAvailableTokens(
        analysis.totalTokens
      ),
    };
  }

  /**
   * Compress context by summarizing older messages
   */
  async compressContext(): Promise<CompressionReport> {
    const startTime = Date.now();
    const isJson = getConfig().logFormat === "json";

    const beforeAnalysis = this.analyzeContext();
    const beforeTokens = beforeAnalysis.totalTokens;
    const beforeMessages = this.historyManager.messages.length;

    if (beforeTokens < beforeAnalysis.threshold) {
      if (this.debugMode) {
        Logger.debug(`No compression needed: ${beforeTokens} < ${beforeAnalysis.threshold}`);
      }
      return {
        triggered: false,
        currentTokens: beforeTokens,
        compressionThreshold: beforeAnalysis.threshold,
        availableTokens: this.tokenCounter.getAvailableTokens(beforeTokens),
      };
    }

    const spinner = isJson
      ? null
      : ora(
          pc.blue(
            `Comprimindo contexto (${beforeTokens} tokens, ${beforeMessages} mensagens)...`
          )
        ).start();

    if (isJson) {
      Logger.info(
        `Comprimindo contexto (${beforeTokens} tokens, ${beforeMessages} mensagens)...`
      );
    }

    try {
      const messages = this.historyManager.messages;

      // Preserve: system prompt + first user message
      const preserved = messages.slice(0, 2);
      const recent = messages.slice(-3); // Keep last 3 messages (current context)

      // Messages to summarize: everything in between
      const toSummarize = messages.slice(2, messages.length - 3);

      if (toSummarize.length === 0) {
        if (spinner) spinner.warn(pc.yellow("Não há mensagens para compactar"));
        if (isJson) Logger.info("Não há mensagens para compactar");

        return {
          triggered: false,
          currentTokens: beforeTokens,
          compressionThreshold: beforeAnalysis.threshold,
          availableTokens: this.tokenCounter.getAvailableTokens(beforeTokens),
        };
      }

      // Summarize the middle section
      const summary = await summarizeMessages(toSummarize);

      // Build compressed message array
      const summaryMessage = {
        role: "system",
        content: `[RESUMO DE CONTEXTO ANTERIOR]\n${summary}\n[FIM DO RESUMO]`,
      };

      const compressedMessages = [...preserved, summaryMessage, ...recent];

      // Update history
      this.historyManager.messages = compressedMessages;
      this.historyManager.saveHistory();

      const afterAnalysis = this.analyzeContext();
      const afterTokens = afterAnalysis.totalTokens;
      const afterMessages = compressedMessages.length;

      const timeMs = Date.now() - startTime;
      const compressionRatio = afterTokens / beforeTokens;

      const stats: CompressionStats = {
        beforeTokens,
        afterTokens,
        messagesBefore: beforeMessages,
        messagesAfter: afterMessages,
        compressionRatio,
        timeMs,
      };

      const successMsg = `Contexto comprimido: ${beforeTokens} → ${afterTokens} tokens (${(
        (1 - compressionRatio) *
        100
      ).toFixed(1)}% redução) em ${timeMs}ms`;

      if (spinner) {
        spinner.succeed(pc.green(successMsg));
      } else {
        Logger.info(successMsg);
      }

      return {
        triggered: true,
        reason: "threshold_reached",
        currentTokens: afterTokens,
        compressionThreshold: afterAnalysis.threshold,
        availableTokens: this.tokenCounter.getAvailableTokens(afterTokens),
        stats,
      };
    } catch (err: any) {
      const errorMsg = `Erro ao compactar contexto: ${err.message}`;

      if (spinner) {
        spinner.fail(pc.red(errorMsg));
      } else {
        Logger.error(errorMsg);
      }

      // Fallback: naive truncation if LLM summarization fails
      try {
        const messages = this.historyManager.messages;
        const preserved = messages.slice(0, 2);
        const recent = messages.slice(-3);
        const toTruncate = messages.slice(2, messages.length - 3);

        // Keep only significant messages (longer ones)
        const significant = toTruncate.filter((msg) => {
          const tokens = this.tokenCounter.countMessageTokens(msg);
          return tokens > 100; // Only keep messages with substantial content
        });

        const truncatedMessages = [
          ...preserved,
          {
            role: "assistant",
            content:
              "[Contexto antigo truncado devido a erro na sumarização LLM]",
          },
          ...significant.slice(-5),
          ...recent,
        ];

        this.historyManager.messages = truncatedMessages;
        this.historyManager.saveHistory();

        const afterTokens = this.tokenCounter.countMessagesTokens(truncatedMessages);
        const timeMs = Date.now() - startTime;

        const fallbackMsg = `Contexto truncado (fallback): ${beforeTokens} → ${afterTokens} tokens em ${timeMs}ms`;

        if (!isJson) {
          Logger.warn(fallbackMsg);
        }

        return {
          triggered: true,
          reason: "threshold_reached",
          currentTokens: afterTokens,
          compressionThreshold: beforeAnalysis.threshold,
          availableTokens: this.tokenCounter.getAvailableTokens(afterTokens),
          stats: {
            beforeTokens,
            afterTokens,
            messagesBefore: messages.length,
            messagesAfter: truncatedMessages.length,
            compressionRatio: afterTokens / beforeTokens,
            timeMs,
          },
        };
      } catch (fallbackErr: any) {
        Logger.error(`Fallback truncation também falhou: ${fallbackErr.message}`);
        throw err;
      }
    }
  }

  /**
   * Get compression status report
   */
  getStatusReport(): string {
    const analysis = this.analyzeContext();
    const shouldCompress = this.shouldCompress();

    const lines = [
      "",
      "╔════════════════════════════════════════════════════════════╗",
      "║           CONTEXT COMPRESSION STATUS REPORT               ║",
      "╚════════════════════════════════════════════════════════════╝",
      "",
      `Model: ${this.tokenCounter.getModelInfo().name}`,
      `Context Window: ${analysis.contextWindow.toLocaleString()} tokens`,
      `Current Usage: ${analysis.totalTokens.toLocaleString()} tokens (${analysis.usagePercentage.toFixed(1)}%)`,
      `Compression Threshold: ${analysis.threshold.toLocaleString()} tokens (${(this.compressionThresholdPercent * 100).toFixed(0)}%)`,
      `Critical Threshold: ${analysis.critical.toLocaleString()} tokens (${(this.criticalThresholdPercent * 100).toFixed(0)}%)`,
      "",
      `Status: ${this.getStatusEmoji(analysis.status)} ${analysis.status.toUpperCase()}`,
      `Available Tokens: ${this.tokenCounter.getAvailableTokens(analysis.totalTokens).toLocaleString()}`,
      `Messages: ${this.historyManager.messages.length}`,
      "",
    ];

    if (shouldCompress.triggered) {
      lines.push(`⚠️  Compression Needed: ${shouldCompress.reason}`);
      if (shouldCompress.stats) {
        lines.push(`   Before: ${shouldCompress.stats.messagesBefore} msgs, ${shouldCompress.stats.beforeTokens} tokens`);
        lines.push(`   After: ${shouldCompress.stats.messagesAfter} msgs, ${shouldCompress.stats.afterTokens} tokens`);
        lines.push(`   Reduction: ${((1 - shouldCompress.stats.compressionRatio) * 100).toFixed(1)}%`);
        lines.push(`   Time: ${shouldCompress.stats.timeMs}ms`);
      }
    } else {
      lines.push(`✅ No compression needed`);
    }

    lines.push("");
    lines.push("═".repeat(62));
    lines.push("");

    return lines.join("\n");
  }

  /**
   * Helper to get emoji for status
   */
  private getStatusEmoji(status: "safe" | "warning" | "critical"): string {
    switch (status) {
      case "safe":
        return "🟢";
      case "warning":
        return "🟡";
      case "critical":
        return "🔴";
    }
  }

  /**
   * Set compression threshold percentage
   */
  setCompressionThreshold(percentage: number): void {
    if (percentage < 0 || percentage > 1) {
      throw new Error("Threshold must be between 0 and 1");
    }
    this.compressionThresholdPercent = percentage;
  }

  /**
   * Set critical threshold percentage
   */
  setCriticalThreshold(percentage: number): void {
    if (percentage < 0 || percentage > 1) {
      throw new Error("Critical threshold must be between 0 and 1");
    }
    this.criticalThresholdPercent = percentage;
  }
}
