/**
 * Token Counting and Context Window Management
 * Provides accurate token estimation for various LLM models
 */

import { getConfig } from "./config";
import { Logger } from "./logger";

/**
 * Model configuration with token limits and pricing
 */
interface ModelConfig {
  name: string;
  contextWindow: number;
  tokenPricingInput: number; // per 1M tokens
  tokenPricingOutput: number; // per 1M tokens
  estimationMethod: "formula" | "tiktoken"; // Which method to use
}

/**
 * Known model configurations
 */
const MODEL_CONFIGS: Record<string, ModelConfig> = {
  "gpt-4": {
    name: "GPT-4",
    contextWindow: 8192,
    tokenPricingInput: 0.03,
    tokenPricingOutput: 0.06,
    estimationMethod: "formula",
  },
  "gpt-4-32k": {
    name: "GPT-4 32K",
    contextWindow: 32768,
    tokenPricingInput: 0.06,
    tokenPricingOutput: 0.12,
    estimationMethod: "formula",
  },
  "gpt-4-turbo": {
    name: "GPT-4 Turbo",
    contextWindow: 128000,
    tokenPricingInput: 0.01,
    tokenPricingOutput: 0.03,
    estimationMethod: "formula",
  },
  "claude-3-5-sonnet-20241022": {
    name: "Claude 3.5 Sonnet",
    contextWindow: 200000,
    tokenPricingInput: 0.003,
    tokenPricingOutput: 0.015,
    estimationMethod: "formula",
  },
  "claude-3-opus-20250729": {
    name: "Claude 3 Opus",
    contextWindow: 200000,
    tokenPricingInput: 0.015,
    tokenPricingOutput: 0.075,
    estimationMethod: "formula",
  },
  "claude-3-sonnet-20240229": {
    name: "Claude 3 Sonnet",
    contextWindow: 200000,
    tokenPricingInput: 0.003,
    tokenPricingOutput: 0.015,
    estimationMethod: "formula",
  },
};

export class TokenCounter {
  private modelConfig: ModelConfig;
  private debugMode: boolean;

  constructor(modelName?: string) {
    const resolvedModel =
      modelName ||
      process.env.LLM_MODEL ||
      "claude-3-5-sonnet-20241022";

    // Find matching model or use default fallback
    this.modelConfig =
      MODEL_CONFIGS[resolvedModel] ||
      MODEL_CONFIGS["claude-3-5-sonnet-20241022"]!;

    const config = getConfig();
    this.debugMode = config.debugMode ?? false;

    if (this.debugMode) {
      Logger.debug(`TokenCounter initialized for: ${this.modelConfig.name}`);
    }
  }

  /**
   * Estimate tokens using simple formula: chars / 4
   * Approximation that works across most LLMs
   */
  private estimateTokensByFormula(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Count tokens in a single text string
   */
  countTokens(text: string): number {
    if (!text) return 0;

    switch (this.modelConfig.estimationMethod) {
      case "tiktoken":
        // Would use tiktoken if installed
        return this.estimateTokensByFormula(text);
      case "formula":
      default:
        return this.estimateTokensByFormula(text);
    }
  }

  /**
   * Count tokens in a message object (text + metadata)
   */
  countMessageTokens(message: any): number {
    let totalTokens = 0;

    // Add overhead for role and structure
    const roleOverhead = 4; // "<|im_start|>{role}\n" overhead

    if (typeof message.content === "string") {
      totalTokens += this.countTokens(message.content);
    } else if (Array.isArray(message.content)) {
      // Multi-part content (e.g., text + image)
      for (const part of message.content) {
        if (part.type === "text" && part.text) {
          totalTokens += this.countTokens(part.text);
        } else if (part.type === "image") {
          // Image tokens depend on resolution, approximate as 500 tokens
          totalTokens += 500;
        }
      }
    }

    return totalTokens + roleOverhead;
  }

  /**
   * Count total tokens in message array
   */
  countMessagesTokens(messages: any[]): number {
    return messages.reduce((sum, msg) => sum + this.countMessageTokens(msg), 0);
  }

  /**
   * Get context window size for current model
   */
  getContextWindowSize(): number {
    return this.modelConfig.contextWindow;
  }

  /**
   * Get available tokens for output (reserve 10% buffer)
   */
  getAvailableTokens(usedTokens: number): number {
    const buffer = Math.ceil(this.modelConfig.contextWindow * 0.1); // 10% buffer
    return Math.max(0, this.modelConfig.contextWindow - usedTokens - buffer);
  }

  /**
   * Calculate compression threshold (when to compress)
   * Default: 50% of context window
   */
  getCompressionThreshold(percentage: number = 0.5): number {
    return Math.floor(this.modelConfig.contextWindow * percentage);
  }

  /**
   * Calculate cost estimation
   */
  estimateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.modelConfig.tokenPricingInput;
    const outputCost = (outputTokens / 1_000_000) * this.modelConfig.tokenPricingOutput;
    return inputCost + outputCost;
  }

  /**
   * Get model info
   */
  getModelInfo(): {
    name: string;
    contextWindow: number;
    compressionThreshold: number;
    buffer: number;
  } {
    const contextWindow = this.getContextWindowSize();
    const buffer = Math.ceil(contextWindow * 0.1);
    const threshold = this.getCompressionThreshold();

    return {
      name: this.modelConfig.name,
      contextWindow,
      compressionThreshold: threshold,
      buffer,
    };
  }

  /**
   * Detailed analysis of message tokens
   */
  analyzeMessages(messages: any[]): {
    totalTokens: number;
    messageBreakdown: Array<{ role: string; tokens: number; percentage: string }>;
    contextWindowPercentage: string;
    recommendedAction: "none" | "monitor" | "compress" | "truncate";
  } {
    const totalTokens = this.countMessagesTokens(messages);
    const contextWindow = this.getContextWindowSize();
    const threshold = this.getCompressionThreshold();

    const messageBreakdown = messages.map((msg) => {
      const tokens = this.countMessageTokens(msg);
      const percentage = ((tokens / totalTokens) * 100).toFixed(1);
      return {
        role: msg.role || "unknown",
        tokens,
        percentage: `${percentage}%`,
      };
    });

    const contextPercentage = ((totalTokens / contextWindow) * 100).toFixed(1);

    let recommendedAction: "none" | "monitor" | "compress" | "truncate" = "none";
    if (totalTokens > contextWindow * 0.9) {
      recommendedAction = "truncate";
    } else if (totalTokens > threshold) {
      recommendedAction = "compress";
    } else if (totalTokens > contextWindow * 0.3) {
      recommendedAction = "monitor";
    }

    return {
      totalTokens,
      messageBreakdown,
      contextWindowPercentage: `${contextPercentage}%`,
      recommendedAction,
    };
  }
}

/**
 * Global token counter instance (singleton pattern)
 */
let globalTokenCounter: TokenCounter | null = null;

export function createTokenCounter(modelName?: string): TokenCounter {
  if (!globalTokenCounter) {
    globalTokenCounter = new TokenCounter(modelName);
  }
  return globalTokenCounter;
}

export function getTokenCounter(): TokenCounter {
  if (!globalTokenCounter) {
    globalTokenCounter = new TokenCounter();
  }
  return globalTokenCounter;
}

export function resetTokenCounter(modelName?: string): TokenCounter {
  globalTokenCounter = new TokenCounter(modelName);
  return globalTokenCounter;
}
