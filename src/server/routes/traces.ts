import { Router } from "express";
import { getTracer } from "../../tracer";

export const tracesRouter = Router();

/**
 * GET /traces/:threadId - Get trace spans for a specific thread
 */
tracesRouter.get("/:threadId", (req, res) => {
  try {
    const { threadId } = req.params;
    const tracer = getTracer(threadId);

    if (!tracer) {
      return res.status(404).json({
        error: "Tracer not found for thread",
        threadId,
      });
    }

    const spans = tracer.getSpans();
    const metrics = tracer.getMetrics();
    const report = tracer.generateReport();

    return res.json({
      threadId,
      spans,
      metrics,
      report,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /traces/:threadId/metrics - Get only metrics for a thread
 */
tracesRouter.get("/:threadId/metrics", (req, res) => {
  try {
    const { threadId } = req.params;
    const tracer = getTracer(threadId);

    if (!tracer) {
      return res.status(404).json({
        error: "Tracer not found for thread",
        threadId,
      });
    }

    const metrics = tracer.getMetrics();

    return res.json({
      threadId,
      metrics,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /traces/:threadId/report - Get human-readable report
 */
tracesRouter.get("/:threadId/report", (req, res) => {
  try {
    const { threadId } = req.params;
    const tracer = getTracer(threadId);

    if (!tracer) {
      return res.status(404).json({
        error: "Tracer not found for thread",
        threadId,
      });
    }

    const report = tracer.generateReport();

    // Return as plain text for better readability
    res.type("text/plain");
    return res.send(report);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /traces/:threadId/spans - Get detailed spans
 */
tracesRouter.get("/:threadId/spans", (req, res) => {
  try {
    const { threadId } = req.params;
    const tracer = getTracer(threadId);

    if (!tracer) {
      return res.status(404).json({
        error: "Tracer not found for thread",
        threadId,
      });
    }

    const spans = tracer.getSpans();

    return res.json({
      threadId,
      totalSpans: spans.length,
      spans,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
