import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MemoryManager } from '../memoryMetadata';

describe('MemoryMetadata', () => {
  let memory: MemoryManager;
  const testMemoryFile = path.join(process.cwd(), '.agent_memory_structured.json');

  beforeEach(() => {
    // Clean up memory file before each test
    if (fs.existsSync(testMemoryFile)) {
      fs.unlinkSync(testMemoryFile);
    }
    // Create a new instance for each test
    memory = new MemoryManager(false);
  });

  describe('Adding Memories', () => {
    it('should add a memory episode', () => {
      const id = memory.addMemory(
        'Implemented authentication system',
        {
          toolsUsed: ['write_file', 'run_command'],
          filesModified: ['src/auth.ts', 'src/types.ts'],
          nodePath: ['explorer', 'architect', 'coder'],
          success: true,
          tags: ['feature', 'backend'],
        }
      );

      expect(id).toMatch(/^mem_/);
      const all = memory.getAllMemories();
      expect(all).toHaveLength(1);
      expect(all[0].content).toBe('Implemented authentication system');
    });

    it('should add memory with error tracking', () => {
      memory.addMemory(
        'Failed to deploy',
        {
          toolsUsed: ['run_command'],
          filesModified: [],
          nodePath: ['coder'],
          success: false,
          error: {
            message: 'Deployment failed: connection timeout',
            type: 'TimeoutError',
            node: 'coder',
          },
        }
      );

      const results = memory.query({ success: false });
      expect(results).toHaveLength(1);
      expect(results[0].entry.metadata.error?.type).toBe('TimeoutError');
    });

    it('should add memory with detailed metrics', () => {
      memory.addMemory(
        'Refactored database layer',
        {
          toolsUsed: ['analyze_codebase', 'write_file', 'run_command', 'run_unit_tests'],
          filesModified: ['src/db/connection.ts', 'src/db/models.ts', 'src/db/queries.ts'],
          nodePath: ['explorer', 'architect', 'coder', 'qa'],
          success: true,
          duration: 5234,
          tokensUsed: { input: 50000, output: 35000 },
          tags: ['refactor', 'database', 'perf'],
          quality: { score: 95, feedback: 'Excellent improvement' },
        }
      );

      const all = memory.getAllMemories();
      expect(all[0].metadata.duration).toBe(5234);
      expect(all[0].metadata.tokensUsed?.input).toBe(50000);
      expect(all[0].metadata.quality?.score).toBe(95);
    });
  });

  describe('Querying by Tools', () => {
    beforeEach(() => {
      memory.addMemory('Used read_file and web_search', {
        toolsUsed: ['read_file', 'web_search'],
        filesModified: [],
        nodePath: ['explorer'],
        success: true,
      });

      memory.addMemory('Used write_file', {
        toolsUsed: ['write_file'],
        filesModified: ['src/app.ts'],
        nodePath: ['coder'],
        success: true,
      });

      memory.addMemory('Used run_command', {
        toolsUsed: ['run_command', 'run_unit_tests'],
        filesModified: [],
        nodePath: ['coder', 'qa'],
        success: true,
      });
    });

    it('should find memories by single tool', () => {
      const results = memory.query({ tools: ['read_file'] });
      expect(results).toHaveLength(1);
      expect(results[0].entry.metadata.toolsUsed).toContain('read_file');
    });

    it('should find memories by multiple tools', () => {
      const results = memory.query({ tools: ['run_command', 'run_unit_tests'] });
      expect(results).toHaveLength(1);
      expect(results[0].entry.metadata.toolsUsed).toContain('run_command');
    });

    it('should use convenience method getMemoriesByTool', () => {
      const results = memory.getMemoriesByTool('read_file', 10);
      expect(results).toHaveLength(1);
      expect(results[0].metadata.toolsUsed).toContain('read_file');
    });
  });

  describe('Querying by Files', () => {
    beforeEach(() => {
      memory.addMemory('Modified config', {
        toolsUsed: ['write_file'],
        filesModified: ['src/config.ts', 'src/types.ts'],
        nodePath: ['coder'],
        success: true,
      });

      memory.addMemory('Modified auth', {
        toolsUsed: ['write_file'],
        filesModified: ['src/auth.ts'],
        nodePath: ['coder'],
        success: true,
      });
    });

    it('should find memories by file', () => {
      const results = memory.query({ files: ['src/config.ts'] });
      expect(results).toHaveLength(1);
      expect(results[0].entry.metadata.filesModified).toContain('src/config.ts');
    });

    it('should use convenience method getMemoriesByFile', () => {
      const results = memory.getMemoriesByFile('src/auth.ts', 10);
      expect(results).toHaveLength(1);
      expect(results[0].metadata.filesModified).toContain('src/auth.ts');
    });
  });

  describe('Querying by Status', () => {
    beforeEach(() => {
      memory.addMemory('Successful task', {
        toolsUsed: ['write_file'],
        filesModified: [],
        nodePath: ['coder'],
        success: true,
      });

      memory.addMemory('Failed task', {
        toolsUsed: ['run_command'],
        filesModified: [],
        nodePath: ['coder'],
        success: false,
        error: { message: 'Command failed', type: 'ExecError', node: 'coder' },
      });

      memory.addMemory('Another success', {
        toolsUsed: ['read_file'],
        filesModified: [],
        nodePath: ['explorer'],
        success: true,
      });
    });

    it('should find successful memories', () => {
      const results = memory.getMemoriesByStatus(true);
      expect(results).toHaveLength(2);
      expect(results.every((m) => m.metadata.success)).toBe(true);
    });

    it('should find failed memories', () => {
      const results = memory.getMemoriesByStatus(false);
      expect(results).toHaveLength(1);
      expect(results[0].metadata.success).toBe(false);
    });
  });

  describe('Querying by Nodes', () => {
    beforeEach(() => {
      memory.addMemory('Explorer path', {
        toolsUsed: ['web_search'],
        filesModified: [],
        nodePath: ['explorer'],
        success: true,
      });

      memory.addMemory('Full path', {
        toolsUsed: ['analyze_codebase', 'write_file', 'run_unit_tests'],
        filesModified: ['src/app.ts'],
        nodePath: ['explorer', 'architect', 'coder', 'qa'],
        success: true,
      });
    });

    it('should find memories by node', () => {
      const results = memory.query({ nodes: ['architect'] });
      expect(results).toHaveLength(1);
      expect(results[0].entry.metadata.nodePath).toContain('architect');
    });

    it('should use convenience method getMemoriesByNode', () => {
      const results = memory.getMemoriesByNode('qa');
      expect(results).toHaveLength(1);
      expect(results[0].metadata.nodePath).toContain('qa');
    });
  });

  describe('Querying by Tags', () => {
    beforeEach(() => {
      memory.addMemory('Feature work', {
        toolsUsed: ['write_file'],
        filesModified: [],
        nodePath: ['coder'],
        success: true,
        tags: ['feature', 'backend'],
      });

      memory.addMemory('Bug fix', {
        toolsUsed: ['read_file', 'write_file'],
        filesModified: [],
        nodePath: ['coder'],
        success: true,
        tags: ['bugfix', 'urgent'],
      });
    });

    it('should find memories by tag', () => {
      const results = memory.query({ tags: ['feature'] });
      expect(results).toHaveLength(1);
      expect(results[0].entry.metadata.tags).toContain('feature');
    });

    it('should use convenience method getMemoriesByTag', () => {
      const results = memory.getMemoriesByTag('bugfix');
      expect(results).toHaveLength(1);
      expect(results[0].metadata.tags).toContain('bugfix');
    });
  });

  describe('Complex Queries', () => {
    beforeEach(() => {
      memory.addMemory('Database refactor', {
        toolsUsed: ['analyze_codebase', 'write_file', 'run_unit_tests'],
        filesModified: ['src/db/connection.ts', 'src/db/models.ts'],
        nodePath: ['explorer', 'architect', 'coder', 'qa'],
        success: true,
        tags: ['refactor', 'database'],
      });

      memory.addMemory('API endpoint', {
        toolsUsed: ['write_file', 'run_unit_tests'],
        filesModified: ['src/api/users.ts'],
        nodePath: ['architect', 'coder', 'qa'],
        success: true,
        tags: ['feature', 'api'],
      });

      memory.addMemory('Failed deployment', {
        toolsUsed: ['run_command'],
        filesModified: [],
        nodePath: ['coder'],
        success: false,
        tags: ['deploy'],
      });
    });

    it('should find memories with multiple filters', () => {
      const results = memory.query({
        tools: ['write_file'],
        success: true,
        tags: ['feature'],
      });
      expect(results).toHaveLength(1);
      expect(results[0].entry.content).toContain('API endpoint');
    });

    it('should apply limit', () => {
      const results = memory.query({ limit: 1 });
      expect(results).toHaveLength(1);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      memory.addMemory('Task 1', {
        toolsUsed: ['read_file', 'web_search'],
        filesModified: ['src/app.ts'],
        nodePath: ['explorer'],
        success: true,
        duration: 1000,
        tags: ['research'],
      });

      memory.addMemory('Task 2', {
        toolsUsed: ['write_file', 'read_file'],
        filesModified: ['src/app.ts', 'src/config.ts'],
        nodePath: ['coder'],
        success: true,
        duration: 2000,
        tags: ['feature'],
      });

      memory.addMemory('Task 3', {
        toolsUsed: ['run_command'],
        filesModified: [],
        nodePath: ['coder'],
        success: false,
        duration: 500,
      });
    });

    it('should calculate statistics', () => {
      const stats = memory.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.successRate).toBe(67); // 2 out of 3 = 66.666... rounds to 67
      expect(stats.averageDuration).toBe(1167); // (1000 + 2000 + 500) / 3 = 1166.666... rounds to 1167
    });

    it('should track common tools', () => {
      const stats = memory.getStats();
      expect(stats.commonTools['read_file']).toBe(2);
      expect(stats.commonTools['write_file']).toBe(1);
    });

    it('should track common files', () => {
      const stats = memory.getStats();
      expect(stats.commonFiles['src/app.ts']).toBe(2);
      expect(stats.commonFiles['src/config.ts']).toBe(1);
    });

    it('should track common tags', () => {
      const stats = memory.getStats();
      expect(stats.commonTags['research']).toBe(1);
      expect(stats.commonTags['feature']).toBe(1);
    });
  });

  describe('Export', () => {
    it('should export all memories', () => {
      memory.addMemory('Episode 1', {
        toolsUsed: ['read_file'],
        filesModified: [],
        nodePath: ['explorer'],
        success: true,
      });

      const exported = memory.export();
      expect(exported).toHaveLength(1);
      expect(exported[0].content).toBe('Episode 1');
    });
  });

  describe('Clear', () => {
    it('should clear all memories', () => {
      memory.addMemory('Episode', {
        toolsUsed: [],
        filesModified: [],
        nodePath: [],
        success: true,
      });

      expect(memory.getAllMemories()).toHaveLength(1);
      memory.clear();
      expect(memory.getAllMemories()).toHaveLength(0);
    });
  });

  describe('Singleton Methods', () => {
    it('should export memory entries', () => {
      memory.addMemory('Test', {
        toolsUsed: [],
        filesModified: [],
        nodePath: [],
        success: true,
      });

      const exported = memory.export();
      expect(exported).toHaveLength(1);
    });
  });
});
