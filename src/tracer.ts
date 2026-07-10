/**
 * Structured Tracing for Agent Execution
 * Captures every step: thought → tool → result → duration
 * Emits to Datadog, logs, and UI via events
 */

import { Logger } from "./logger";
import { DatadogDispatcher } from "./datadog";
import { getConfig } from "./config";

export interface TraceSpan {
  spanId: string;
  traceId: string;
  threadId: string;
  node: string;
  tool?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tokens?: {
    input: number;
    output: number;
  };
  error?: {
    message: string;
    type: string;
  };
  metadata?: Record<string, any>;
}

export interface TraceMetrics {
  totalDuration: number;
  nodeMetrics: Record<string, { count: number; totalDuration: number; errorCount: number }>;
  toolMetrics: Record<string, { count: number; totalDuration: number; errorCount: number }>;
  totalTokens: { input: number; output: number };
}

export class StepTracer {
  private spans: Map<string, TraceSpan> = new Map();
  private traceId: string;
  private threadId: string;
  private sessionStartTime: number;
  private debugMode: boolean;
  private readonly spanStack: string[] = [];

  constructor(threadId: string) {
    this.threadId = threadId;
    this.traceId = `trace_${threadId}_${Date.now()}`;
    this.sessionStartTime = Date.now();
    this.debugMode = getConfig().debugMode ?? false;
  }

  /**
   * Start a new trace span (for nodes or tool executions)
   */
  startSpan(node: string, tool?: string, metadata?: Record<string, any>): string {
    const spanId = `span_${this.spans.size}_${Date.now()}`;
    const span: TraceSpan = {
      spanId,
      traceId: this.traceId,
      threadId: this.threadId,
      node,
      tool,
      startTime: Date.now(),
      metadata,
    };

    this.spans.set(spanId, span);
    this.spanStack.push(spanId);

    if (this.debugMode) {
      Logger.debug(`[TRACE START] ${node}${tool ? ` → ${tool}` : ""}`, { spanId });
    }

    return spanId;
  }

  /**
   * End a trace span with result information
   */
  endSpan(
    spanId: string,
    result?: {
      tokens?: { input: number; output: number };
      error?: { message: string; type?: string };
    }
  ): void {
    const span = this.spans.get(spanId);
    if (!span) {
      Logger.warn(`[TRACE] Attempted to end unknown span: ${spanId}`);
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;

    if (result?.tokens) {
      span.tokens = result.tokens;
    }

    if (result?.error) {
      span.error = {
        message: result.error.message,
        type: result.error.type || "unknown",
      };
    }

    this.spanStack.pop();

    if (this.debugMode) {
      Logger.debug(`[TRACE END] ${span.node}${span.tool ? ` → ${span.tool}` : ""}`, {
        spanId,
        duration: span.duration,
        tokens: span.tokens,
        error: span.error?.message,
      });
    }
  }

  /**
   * Get current span on top of stack
   */
  getCurrentSpan(): TraceSpan | undefined {
    if (this.spanStack.length === 0) return undefined;
    const spanId = this.spanStack[this.spanStack.length - 1];
    return this.spans.get(spanId);
  }

  /**
   * Add event marker to current span
   */
  addMarker(marker: string, data?: Record<string, any>): void {
    const current = this.getCurrentSpan();
    if (!current) return;

    if (!current.metadata) current.metadata = {};
    if (!current.metadata.markers) current.metadata.markers = [];

    current.metadata.markers.push({
      timestamp: Date.now(),
      marker,
      data,
    });

    if (this.debugMode) {
      Logger.debug(`[MARKER] ${marker}`, data);
    }
  }

  /**
   * Calculate aggregated metrics from all spans
   */
  getMetrics(): TraceMetrics {
    const nodeMetrics: Record<string, { count: number; totalDuration: number; errorCount: number }> = {};
    const toolMetrics: Record<string, { count: number; totalDuration: number; errorCount: number }> = {};
    let totalDuration = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const span of this.spans.values()) {
      if (!span.endTime) continue;

      const duration = span.duration || 0;
      totalDuration = Math.max(totalDuration, span.endTime - this.sessionStartTime);

      // Node metrics
      if (!nodeMetrics[span.node]) {
        nodeMetrics[span.node] = { count: 0, totalDuration: 0, errorCount: 0 };
      }
      nodeMetrics[span.node].count++;
      nodeMetrics[span.node].totalDuration += duration;
      if (span.error) nodeMetrics[span.node].errorCount++;

      // Tool metrics
      if (span.tool) {
        if (!toolMetrics[span.tool]) {
          toolMetrics[span.tool] = { count: 0, totalDuration: 0, errorCount: 0 };
        }
        toolMetrics[span.tool].count++;
        toolMetrics[span.tool].totalDuration += duration;
        if (span.error) toolMetrics[span.tool].errorCount++;
      }

      // Token aggregation
      if (span.tokens) {
        totalInputTokens += span.tokens.input || 0;
        totalOutputTokens += span.tokens.output || 0;
      }
    }

    return {
      totalDuration,
      nodeMetrics,
      toolMetrics,
      totalTokens: { input: totalInputTokens, output: totalOutputTokens },
    };
  }

  /**
   * Get all spans as structured data
   */
  getSpans(): TraceSpan[] {
    return Array.from(this.spans.values()).sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Flush traces to Datadog and return summary
   */
  async flush(): Promise<void> {
    const metrics = this.getMetrics();

    // Log trace summary
    Logger.info(`[TRACE SUMMARY] Session complete`, {
      traceId: this.traceId,
      threadId: this.threadId,
      totalDuration: metrics.totalDuration,
      totalSpans: this.spans.size,
      totalTokens: metrics.totalTokens,
      nodes: Object.keys(metrics.nodeMetrics),
      tools: Object.keys(metrics.toolMetrics),
    });

    // Send detailed metrics to Datadog
    for (const span of this.spans.values()) {
      if (!span.endTime) continue;

      DatadogDispatcher.addLog("info", `[TRACE SPAN] ${span.node}${span.tool ? ` → ${span.tool}` : ""}`, {
        traceId: this.traceId,
        spanId: span.spanId,
        threadId: this.threadId,
        node: span.node,
        tool: span.tool,
        duration: span.duration,
        tokens: span.tokens,
        error: span.error,
        metadata: span.metadata,
      });
    }

    await DatadogDispatcher.flush();
  }

  /**
   * Generate human-readable trace report
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const lines = [
      "",
      "╔════════════════════════════════════════════════════════════╗",
      "║              TRACE EXECUTION SUMMARY REPORT               ║",
      "╚════════════════════════════════════════════════════════════╝",
      "",
      `Trace ID: ${this.traceId}`,
      `Thread ID: ${this.threadId}`,
      `Total Duration: ${metrics.totalDuration}ms`,
      `Total Spans: ${this.spans.size}`,
      `Total Tokens: Input=${metrics.totalTokens.input} Output=${metrics.totalTokens.output}`,
      "",
      "Node Breakdown:",
    ];

    for (const [node, stats] of Object.entries(metrics.nodeMetrics)) {
      const avgDuration = stats.totalDuration / stats.count;
      const errorRate = stats.count > 0 ? ((stats.errorCount / stats.count) * 100).toFixed(1) : "0";
      lines.push(
        `  ${node}: ${stats.count} calls, ${stats.totalDuration}ms total, ${avgDuration.toFixed(0)}ms avg, ${errorRate}% errors`
      );
    }

    if (Object.keys(metrics.toolMetrics).length > 0) {
      lines.push("");
      lines.push("Tool Breakdown (Top 10):");

      const topTools = Object.entries(metrics.toolMetrics)
        .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
        .slice(0, 10);

      for (const [tool, stats] of topTools) {
        const avgDuration = stats.totalDuration / stats.count;
        const errorRate = stats.count > 0 ? ((stats.errorCount / stats.count) * 100).toFixed(1) : "0";
        lines.push(
          `  ${tool}: ${stats.count} calls, ${stats.totalDuration}ms total, ${avgDuration.toFixed(0)}ms avg, ${errorRate}% errors`
        );
      }
    }

    lines.push("");
    lines.push("═".repeat(62));
    lines.push("");

    return lines.join("\n");
  }
}

/**
 * Global trace manager per session
 */
const tracers = new Map<string, StepTracer>();

export function createTracer(threadId: string): StepTracer {
  if (tracers.has(threadId)) {
    return tracers.get(threadId)!;
  }
  const tracer = new StepTracer(threadId);
  tracers.set(threadId, tracer);
  return tracer;
}

export function getTracer(threadId: string): StepTracer | undefined {
  return tracers.get(threadId);
}

export function removeTracer(threadId: string): void {
  tracers.delete(threadId);
}
