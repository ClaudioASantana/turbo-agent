/**
 * Integration tests for Agent with HARNESS features
 * Tests Context Compression and Memory Metadata integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMemoryManager, createMemoryManager } from '../memoryMetadata';
import { ContextCompressor } from '../contextCompressor';
import { HistoryManager } from '../historyManager';
import * as fs from 'fs';

const TEST_HISTORY_FILE = '.test_agent_integration_history.json';
const TEST_MEMORY_FILE = '.agent_memory_structured.json';

describe('HARNESS Feature Integration Tests', () => {
  beforeEach(() => {
    // Clean up test files
    [TEST_HISTORY_FILE, TEST_MEMORY_FILE].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });

    // Force creation of fresh memory manager for each test
    createMemoryManager(false);
  });

  afterEach(() => {
    // Clean up
    [TEST_HISTORY_FILE, TEST_MEMORY_FILE].forEach(file => {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    });
  });

  describe('Memory Metadata Integration', () => {
    it('should store and retrieve memory with metadata', () => {
      const memory = getMemoryManager();

      const memoryId = memory.addMemory(
        '[explorer→coder] Test task',
        {
          toolsUsed: ['read_file', 'write_file'],
          filesModified: ['test.ts'],
          nodePath: ['explorer', 'coder'],
          success: true,
          duration: 1500,
          tokensUsed: { input: 100, output: 50 },
          userGoal: 'Test task',
          outcome: 'Task completed',
          tags: ['test'],
        }
      );

      expect(memoryId).toBeDefined();
      expect(memoryId).toMatch(/^mem_/);

      // Query by tool
      const results = memory.query({ tools: ['read_file'] });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.metadata.toolsUsed).toContain('read_file');
    });

    it('should filter memories by multiple criteria', () => {
      const memory = getMemoryManager();
      const beforeCount = memory.query({}).length;

      // Add multiple memories
      memory.addMemory('Task 1', {
        toolsUsed: ['read_file'],
        filesModified: ['a.ts'],
        nodePath: ['coder'],
        success: true,
        tags: ['feature'],
      });

      memory.addMemory('Task 2', {
        toolsUsed: ['write_file'],
        filesModified: ['b.ts'],
        nodePath: ['coder'],
        success: false,
        tags: ['bugfix'],
      });

      const afterCount = memory.query({}).length;
      expect(afterCount).toBe(beforeCount + 2);

      // Query successful tasks only
      const successful = memory.query({ success: true });
      const task1 = successful.find(r => r.entry.content === 'Task 1');
      expect(task1).toBeDefined();

      // Query by tag
      const features = memory.query({ tags: ['feature'] });
      const featureTask = features.find(r => r.entry.metadata.tags?.includes('feature'));
      expect(featureTask).toBeDefined();
    });

    it('should generate statistics from memories', () => {
      const memory = getMemoryManager();
      const beforeCount = memory.query({}).length;

      memory.addMemory('Success 1', {
        toolsUsed: ['read_file'],
        filesModified: [],
        nodePath: ['coder'],
        success: true,
        duration: 1000,
      });

      memory.addMemory('Success 2', {
        toolsUsed: ['write_file'],
        filesModified: [],
        nodePath: ['coder'],
        success: true,
        duration: 2000,
      });

      memory.addMemory('Failure', {
        toolsUsed: ['run_command'],
        filesModified: [],
        nodePath: ['coder'],
        success: false,
        duration: 500,
      });

      const stats = memory.getStats();
      expect(stats.totalEntries).toBeGreaterThanOrEqual(beforeCount + 3);
      expect(stats.successRate).toBeGreaterThan(0);
      expect(stats.successRate).toBeLessThanOrEqual(100);
      expect(stats.averageDuration).toBeGreaterThan(0);
      expect(Object.keys(stats.commonTools).length).toBeGreaterThan(0);
    });
  });

  describe('Context Compression Integration', () => {
    it('should detect when compression is needed', () => {
      const historyManager = new HistoryManager(TEST_HISTORY_FILE, 10);

      // Fill history with many messages
      for (let i = 0; i < 20; i++) {
        historyManager.addMessage('user', `Message ${i} `.repeat(100)); // Long messages
      }

      const compressor = new ContextCompressor(historyManager);
      const report = compressor.shouldCompress();

      // Should trigger at some point
      expect(report).toBeDefined();
      expect(report.currentTokens).toBeGreaterThan(0);
    });

    it('should analyze context usage', () => {
      const historyManager = new HistoryManager(TEST_HISTORY_FILE, 100);

      historyManager.addMessage('user', 'Hello');
      historyManager.addMessage('assistant', 'Hi there!');

      const compressor = new ContextCompressor(historyManager);
      const analysis = compressor.analyzeContext();

      expect(analysis.totalTokens).toBeGreaterThan(0);
      expect(analysis.usagePercentage).toBeGreaterThanOrEqual(0);
      expect(analysis.usagePercentage).toBeLessThanOrEqual(100);
      expect(analysis.contextWindow).toBeGreaterThan(0);
      expect(['safe', 'warning', 'critical']).toContain(analysis.status);
    });

    it('should generate status report', () => {
      const historyManager = new HistoryManager(TEST_HISTORY_FILE, 100);
      historyManager.addMessage('user', 'Test message');

      const compressor = new ContextCompressor(historyManager);
      const report = compressor.getStatusReport();

      // Report is a formatted string with emoji boxes
      expect(report).toBeDefined();
      expect(report.length).toBeGreaterThan(0);
      expect(report).toMatch(/tokens|Messages/i);
    });
  });

  describe('Integration: Memory + Compression', () => {
    it('should work together without conflicts', () => {
      const historyManager = new HistoryManager(TEST_HISTORY_FILE, 100);
      const memory = getMemoryManager();
      const compressor = new ContextCompressor(historyManager);

      // Add some history
      historyManager.addMessage('user', 'Do something');
      historyManager.addMessage('assistant', 'Done!');

      // Store memory
      memory.addMemory('Task completed', {
        toolsUsed: ['test_tool'],
        filesModified: [],
        nodePath: ['coder'],
        success: true,
      });

      // Check compression status
      const compressionReport = compressor.shouldCompress();
      const memoryResults = memory.query({});

      expect(compressionReport).toBeDefined();
      expect(memoryResults.length).toBeGreaterThan(0);
    });
  });
});
