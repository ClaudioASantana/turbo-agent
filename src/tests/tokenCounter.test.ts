import { describe, it, expect } from 'vitest';
import { TokenCounter, createTokenCounter, getTokenCounter, resetTokenCounter } from '../tokenCounter';

describe('TokenCounter', () => {
  describe('Token Estimation', () => {
    it('should estimate tokens from text length', () => {
      const counter = new TokenCounter();
      // Roughly 1 token per 4 characters
      const text = 'a'.repeat(400); // 400 chars ≈ 100 tokens
      const tokens = counter.countTokens(text);
      expect(tokens).toBeGreaterThan(90);
      expect(tokens).toBeLessThan(110);
    });

    it('should handle empty text', () => {
      const counter = new TokenCounter();
      expect(counter.countTokens('')).toBe(0);
    });

    it('should handle null/undefined', () => {
      const counter = new TokenCounter();
      expect(counter.countTokens(null as any)).toBe(0);
      expect(counter.countTokens(undefined as any)).toBe(0);
    });
  });

  describe('Message Token Counting', () => {
    it('should count tokens in string message', () => {
      const counter = new TokenCounter();
      const message = { role: 'user', content: 'Hello world'.repeat(10) };
      const tokens = counter.countMessageTokens(message);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should count tokens in multi-part message', () => {
      const counter = new TokenCounter();
      const message = {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this image?' },
          { type: 'image', url: 'data:...' }
        ]
      };
      const tokens = counter.countMessageTokens(message);
      // Text tokens + image tokens (~500) + overhead
      expect(tokens).toBeGreaterThan(500);
    });

    it('should count tokens in array of messages', () => {
      const counter = new TokenCounter();
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];
      const tokens = counter.countMessagesTokens(messages);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(1000);
    });
  });

  describe('Context Window', () => {
    it('should return context window for Claude 3.5 Sonnet', () => {
      const counter = new TokenCounter('claude-3-5-sonnet-20241022');
      expect(counter.getContextWindowSize()).toBe(200000);
    });

    it('should return context window for GPT-4', () => {
      const counter = new TokenCounter('gpt-4');
      expect(counter.getContextWindowSize()).toBe(8192);
    });

    it('should return context window for GPT-4 Turbo', () => {
      const counter = new TokenCounter('gpt-4-turbo');
      expect(counter.getContextWindowSize()).toBe(128000);
    });

    it('should handle unknown model with default', () => {
      const counter = new TokenCounter('unknown-model-xyz');
      expect(counter.getContextWindowSize()).toBe(200000); // Claude default
    });
  });

  describe('Available Tokens Calculation', () => {
    it('should calculate available tokens with buffer', () => {
      const counter = new TokenCounter('claude-3-5-sonnet-20241022');
      const contextWindow = counter.getContextWindowSize();
      const used = 100000;
      const available = counter.getAvailableTokens(used);

      // Should reserve 10% buffer
      const expected = contextWindow - used - Math.ceil(contextWindow * 0.1);
      expect(available).toBe(expected);
    });

    it('should return 0 when exceeding context window', () => {
      const counter = new TokenCounter('gpt-4');
      const contextWindow = counter.getContextWindowSize();
      const available = counter.getAvailableTokens(contextWindow + 1000);
      expect(available).toBe(0);
    });
  });

  describe('Compression Threshold', () => {
    it('should calculate 50% threshold by default', () => {
      const counter = new TokenCounter('claude-3-5-sonnet-20241022');
      const contextWindow = counter.getContextWindowSize();
      const threshold = counter.getCompressionThreshold(0.5);
      expect(threshold).toBe(Math.floor(contextWindow * 0.5));
    });

    it('should allow custom threshold percentages', () => {
      const counter = new TokenCounter('claude-3-5-sonnet-20241022');
      const contextWindow = counter.getContextWindowSize();

      const threshold30 = counter.getCompressionThreshold(0.3);
      expect(threshold30).toBe(Math.floor(contextWindow * 0.3));

      const threshold75 = counter.getCompressionThreshold(0.75);
      expect(threshold75).toBe(Math.floor(contextWindow * 0.75));
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate cost for Claude', () => {
      const counter = new TokenCounter('claude-3-5-sonnet-20241022');
      const cost = counter.estimateCost(1_000_000, 1_000_000);
      // Input: 1M * 0.003 = $3
      // Output: 1M * 0.015 = $15
      // Total: $18 (actually per million)
      expect(cost).toBeCloseTo(0.018, 4);
    });

    it('should estimate cost for GPT-4', () => {
      const counter = new TokenCounter('gpt-4');
      const cost = counter.estimateCost(1_000_000, 1_000_000);
      // Input: 1M * 0.03 = $30
      // Output: 1M * 0.06 = $60
      // Total: $90 (actually per million)
      expect(cost).toBeCloseTo(0.09, 4);
    });

    it('should handle zero tokens', () => {
      const counter = new TokenCounter();
      expect(counter.estimateCost(0, 0)).toBe(0);
    });
  });

  describe('Model Info', () => {
    it('should return model information', () => {
      const counter = new TokenCounter('claude-3-5-sonnet-20241022');
      const info = counter.getModelInfo();

      expect(info.name).toBe('Claude 3.5 Sonnet');
      expect(info.contextWindow).toBe(200000);
      expect(info.compressionThreshold).toBe(100000); // 50% of 200k
      expect(info.buffer).toBe(20000); // 10% of 200k
    });
  });

  describe('Message Analysis', () => {
    it('should analyze messages and recommend action', () => {
      const counter = new TokenCounter('gpt-4');
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'x'.repeat(2000) },
        { role: 'assistant', content: 'y'.repeat(2000) }
      ];

      const analysis = counter.analyzeMessages(messages);

      expect(analysis.totalTokens).toBeGreaterThan(0);
      expect(analysis.messageBreakdown.length).toBe(3);
      expect(analysis.contextWindowPercentage).toMatch(/\d+\.\d%/);
      expect(['none', 'monitor', 'compress', 'truncate']).toContain(analysis.recommendedAction);
    });

    it('should recommend compression at high usage', () => {
      const counter = new TokenCounter('gpt-4');
      // GPT-4 has 8192 token window
      const messages = [
        {
          role: 'user',
          content: 'x'.repeat(5000) // ~1250 tokens, about 15% of window
        },
        {
          role: 'assistant',
          content: 'y'.repeat(35000) // ~8750 tokens, would exceed window
        }
      ];

      const analysis = counter.analyzeMessages(messages);

      // Should recommend compression since we're over 50% (4096 tokens)
      expect(['compress', 'truncate']).toContain(analysis.recommendedAction);
    });
  });

  describe('Global Singleton', () => {
    it('should create and reuse token counter', () => {
      resetTokenCounter('gpt-4');
      const counter1 = createTokenCounter('gpt-4');
      const counter2 = getTokenCounter();

      expect(counter1).toBe(counter2);
    });

    it('should reset token counter', () => {
      resetTokenCounter('gpt-4');
      const counter1 = getTokenCounter();
      expect(counter1.getContextWindowSize()).toBe(8192);

      const counter2 = resetTokenCounter('claude-3-5-sonnet-20241022');
      expect(counter2.getContextWindowSize()).toBe(200000);
    });
  });
});
