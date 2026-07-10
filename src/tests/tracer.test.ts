import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StepTracer, createTracer, getTracer, removeTracer } from '../tracer';

describe('StepTracer', () => {
  let tracer: StepTracer;
  const threadId = 'test-thread-1';

  beforeEach(() => {
    tracer = new StepTracer(threadId);
  });

  afterEach(() => {
    removeTracer(threadId);
  });

  describe('Span Management', () => {
    it('should create a span with correct properties', () => {
      const spanId = tracer.startSpan('explorer_node');
      expect(spanId).toMatch(/^span_/);

      const spans = tracer.getSpans();
      expect(spans).toHaveLength(1);
      expect(spans[0].node).toBe('explorer_node');
      expect(spans[0].startTime).toBeGreaterThan(0);
    });

    it('should end a span and calculate duration', async () => {
      const spanId = tracer.startSpan('architect_node');
      await new Promise(resolve => setTimeout(resolve, 10));
      tracer.endSpan(spanId);

      const spans = tracer.getSpans();
      expect(spans[0].endTime).toBeDefined();
      expect(spans[0].duration).toBeGreaterThanOrEqual(10);
    });

    it('should track tool execution', () => {
      const spanId = tracer.startSpan('tool', 'read_file');
      tracer.endSpan(spanId);

      const spans = tracer.getSpans();
      expect(spans[0].tool).toBe('read_file');
    });

    it('should handle token tracking', () => {
      const spanId = tracer.startSpan('explorer_node');
      tracer.endSpan(spanId, {
        tokens: { input: 150, output: 200 },
      });

      const spans = tracer.getSpans();
      expect(spans[0].tokens?.input).toBe(150);
      expect(spans[0].tokens?.output).toBe(200);
    });

    it('should handle error tracking', () => {
      const spanId = tracer.startSpan('architect_node');
      tracer.endSpan(spanId, {
        error: { message: 'Parsing failed', type: 'ValidationError' },
      });

      const spans = tracer.getSpans();
      expect(spans[0].error?.message).toBe('Parsing failed');
      expect(spans[0].error?.type).toBe('ValidationError');
    });
  });

  describe('Span Stack Management', () => {
    it('should maintain span stack for nested operations', () => {
      const span1 = tracer.startSpan('parent_node');
      const span2 = tracer.startSpan('child_tool', 'nested_tool');

      let current = tracer.getCurrentSpan();
      expect(current?.tool).toBe('nested_tool');

      tracer.endSpan(span2);
      current = tracer.getCurrentSpan();
      expect(current?.node).toBe('parent_node');

      tracer.endSpan(span1);
      current = tracer.getCurrentSpan();
      expect(current).toBeUndefined();
    });
  });

  describe('Markers', () => {
    it('should add markers to current span', () => {
      const spanId = tracer.startSpan('explorer_node');
      tracer.addMarker('context_loaded', { files: 5 });
      tracer.addMarker('search_completed', { results: 10 });
      tracer.endSpan(spanId);

      const spans = tracer.getSpans();
      expect(spans[0].metadata?.markers).toHaveLength(2);
      expect(spans[0].metadata?.markers?.[0].marker).toBe('context_loaded');
    });

    it('should ignore marker if no current span', () => {
      tracer.addMarker('orphan_marker'); // Should not throw
      const spans = tracer.getSpans();
      expect(spans).toHaveLength(0);
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate node metrics', async () => {
      // Node 1: 2 calls
      const span1 = tracer.startSpan('explorer_node');
      await new Promise(resolve => setTimeout(resolve, 5));
      tracer.endSpan(span1);

      const span2 = tracer.startSpan('explorer_node');
      await new Promise(resolve => setTimeout(resolve, 5));
      tracer.endSpan(span2);

      // Node 2: 1 call
      const span3 = tracer.startSpan('architect_node');
      tracer.endSpan(span3);

      const metrics = tracer.getMetrics();
      expect(metrics.nodeMetrics['explorer_node'].count).toBe(2);
      expect(metrics.nodeMetrics['architect_node'].count).toBe(1);
    });

    it('should calculate tool metrics', () => {
      tracer.startSpan('tool', 'read_file');
      tracer.endSpan(tracer.getSpans()[0].spanId);

      tracer.startSpan('tool', 'read_file');
      tracer.endSpan(tracer.getSpans()[1].spanId);

      tracer.startSpan('tool', 'write_file');
      tracer.endSpan(tracer.getSpans()[2].spanId);

      const metrics = tracer.getMetrics();
      expect(metrics.toolMetrics['read_file'].count).toBe(2);
      expect(metrics.toolMetrics['write_file'].count).toBe(1);
    });

    it('should aggregate token counts', () => {
      const span1 = tracer.startSpan('explorer_node');
      tracer.endSpan(span1, { tokens: { input: 100, output: 150 } });

      const span2 = tracer.startSpan('architect_node');
      tracer.endSpan(span2, { tokens: { input: 200, output: 300 } });

      const metrics = tracer.getMetrics();
      expect(metrics.totalTokens.input).toBe(300);
      expect(metrics.totalTokens.output).toBe(450);
    });

    it('should track error rates', () => {
      const span1 = tracer.startSpan('explorer_node');
      tracer.endSpan(span1); // No error

      const span2 = tracer.startSpan('explorer_node');
      tracer.endSpan(span2, { error: { message: 'Test error' } }); // Error

      const metrics = tracer.getMetrics();
      expect(metrics.nodeMetrics['explorer_node'].errorCount).toBe(1);
    });
  });

  describe('Report Generation', () => {
    it('should generate a readable report', () => {
      const span1 = tracer.startSpan('explorer_node');
      tracer.endSpan(span1, { tokens: { input: 100, output: 200 } });

      const span2 = tracer.startSpan('tool', 'read_file');
      tracer.endSpan(span2);

      const report = tracer.generateReport();
      expect(report).toContain('TRACE EXECUTION SUMMARY REPORT');
      expect(report).toContain('explorer_node');
      expect(report).toContain('read_file');
      expect(report).toContain('Input=100');
      expect(report).toContain('Output=200');
    });
  });

  describe('Global Tracer Management', () => {
    it('should create and retrieve tracers globally', () => {
      const tracer1 = createTracer('thread-1');
      const tracer2 = createTracer('thread-2');

      expect(getTracer('thread-1')).toBe(tracer1);
      expect(getTracer('thread-2')).toBe(tracer2);
    });

    it('should reuse existing tracer if already created', () => {
      const tracer1 = createTracer('thread-1');
      const tracer1Again = createTracer('thread-1');

      expect(tracer1).toBe(tracer1Again);
    });

    it('should remove tracer from global store', () => {
      createTracer('thread-1');
      expect(getTracer('thread-1')).toBeDefined();

      removeTracer('thread-1');
      expect(getTracer('thread-1')).toBeUndefined();
    });
  });

  describe('Span ID Generation', () => {
    it('should generate unique span IDs', () => {
      const span1 = tracer.startSpan('node1');
      const span2 = tracer.startSpan('node2');

      expect(span1).not.toBe(span2);
    });
  });

  describe('Metadata Handling', () => {
    it('should store and preserve metadata', () => {
      const metadata = { userId: 'user123', sessionId: 'sess456' };
      const spanId = tracer.startSpan('explorer_node', undefined, metadata);
      tracer.endSpan(spanId);

      const spans = tracer.getSpans();
      expect(spans[0].metadata).toEqual(metadata);
    });
  });
});
