/**
 * Memory with Structured Metadata
 * Stores episodic memories with context: tools used, files modified, success status, etc.
 * Enables semantic queries enriched with metadata filters
 */

import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { Logger } from './logger';

const MEMORY_FILE = path.join(process.cwd(), '.agent_memory_structured.json');

/**
 * Structured memory entry with metadata
 */
export interface MemoryEntry {
  id: string;
  timestamp: string;
  content: string; // Human-readable summary
  embedding?: number[]; // Optional embedding for semantic search
  metadata: {
    toolsUsed: string[]; // Tools invoked during this episode
    filesModified: string[]; // Files touched
    fileChanges?: Record<string, { action: 'create' | 'update' | 'delete'; lines?: number }>; // Detailed changes
    nodePath: string[]; // Path through agent nodes (explorer → architect → coder → qa)
    success: boolean; // Did the episode complete successfully?
    error?: {
      message: string;
      type: string;
      node: string; // Which node failed?
    };
    duration?: number; // ms
    tokensUsed?: {
      input: number;
      output: number;
    };
    userGoal?: string; // What user asked for
    outcome?: string; // What was delivered
    quality?: {
      score: number; // 0-100
      feedback?: string;
    };
    tags?: string[]; // Custom tags (refactor, bugfix, feature, etc.)
  };
}

/**
 * Memory query options
 */
export interface QueryOptions {
  // Metadata filters
  tools?: string[]; // Only episodes using these tools
  files?: string[]; // Only episodes modifying these files
  success?: boolean; // Only successful/failed episodes
  nodes?: string[]; // Only episodes going through these nodes
  tags?: string[]; // Only episodes with these tags
  dateRange?: {
    start: Date;
    end: Date;
  };
  // Search options
  limit?: number;
  threshold?: number; // Similarity threshold for semantic search
}

/**
 * Query result with score
 */
export interface QueryResult {
  entry: MemoryEntry;
  score: number; // Similarity score 0-1, or relevance score if filtering
  matchedCriteria: string[]; // Which metadata matched
}

export class MemoryManager {
  private entries: MemoryEntry[] = [];
  private debugMode: boolean = false;

  constructor(debugMode: boolean = false) {
    this.debugMode = debugMode;
    this.loadMemory();
  }

  /**
   * Load memory from disk
   */
  private loadMemory(): void {
    if (!fs.existsSync(MEMORY_FILE)) {
      this.entries = [];
      return;
    }

    try {
      const data = fs.readFileSync(MEMORY_FILE, 'utf-8');
      this.entries = JSON.parse(data);
      if (this.debugMode) {
        Logger.debug(`Loaded ${this.entries.length} memory entries`);
      }
    } catch (e) {
      Logger.warn(`Failed to load memory file: ${e}`);
      this.entries = [];
    }
  }

  /**
   * Save memory to disk
   */
  private saveMemory(): void {
    try {
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.entries, null, 2), 'utf-8');
      if (this.debugMode) {
        Logger.debug(`Saved ${this.entries.length} memory entries`);
      }
    } catch (e) {
      Logger.error(`Failed to save memory: ${e}`);
    }
  }

  /**
   * Store a new memory episode
   */
  addMemory(
    content: string,
    metadata: MemoryEntry['metadata'],
    embedding?: number[]
  ): string {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const entry: MemoryEntry = {
      id,
      timestamp: new Date().toISOString(),
      content,
      embedding,
      metadata,
    };

    this.entries.push(entry);
    this.saveMemory();

    if (this.debugMode) {
      Logger.debug(`Added memory: ${content.substring(0, 50)}... [tools: ${metadata.toolsUsed.join(',')}]`);
    }

    return id;
  }

  /**
   * Retrieve all memories matching criteria
   */
  query(options: QueryOptions): QueryResult[] {
    let results: QueryResult[] = [];

    for (const entry of this.entries) {
      const matchedCriteria: string[] = [];
      let score = 1;

      // Tool filter
      if (options.tools && options.tools.length > 0) {
        const overlap = options.tools.filter((t) =>
          entry.metadata.toolsUsed.includes(t)
        );
        if (overlap.length === 0) continue;
        matchedCriteria.push(`tools: ${overlap.join(',')}`);
        score *= overlap.length / options.tools.length; // Partial scoring
      }

      // File filter
      if (options.files && options.files.length > 0) {
        const overlap = options.files.filter((f) =>
          entry.metadata.filesModified.includes(f)
        );
        if (overlap.length === 0) continue;
        matchedCriteria.push(`files: ${overlap.join(',')}`);
        score *= overlap.length / options.files.length;
      }

      // Success filter
      if (options.success !== undefined) {
        if (entry.metadata.success !== options.success) continue;
        matchedCriteria.push(`success: ${options.success}`);
      }

      // Node path filter
      if (options.nodes && options.nodes.length > 0) {
        const overlap = options.nodes.filter((n) =>
          entry.metadata.nodePath.includes(n)
        );
        if (overlap.length === 0) continue;
        matchedCriteria.push(`nodes: ${overlap.join(',')}`);
      }

      // Tag filter
      if (options.tags && options.tags.length > 0 && entry.metadata.tags) {
        const overlap = options.tags.filter((t) =>
          entry.metadata.tags!.includes(t)
        );
        if (overlap.length === 0) continue;
        matchedCriteria.push(`tags: ${overlap.join(',')}`);
      }

      // Date range filter
      if (options.dateRange) {
        const entryDate = new Date(entry.timestamp);
        if (
          entryDate < options.dateRange.start ||
          entryDate > options.dateRange.end
        ) {
          continue;
        }
        matchedCriteria.push('date: in range');
      }

      // If we got here, entry matches all criteria
      const hasFilters = Object.keys(options).some(
        (k) =>
          options[k as keyof QueryOptions] !== undefined &&
          k !== 'limit' &&
          k !== 'threshold'
      );

      if (!hasFilters || matchedCriteria.length > 0) {
        results.push({
          entry,
          score,
          matchedCriteria,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    const limit = options.limit || 10;
    return results.slice(0, limit);
  }

  /**
   * Get memories for a specific tool
   */
  getMemoriesByTool(tool: string, limit: number = 5): MemoryEntry[] {
    return this.query({ tools: [tool], limit }).map((r) => r.entry);
  }

  /**
   * Get memories for files modified
   */
  getMemoriesByFile(file: string, limit: number = 5): MemoryEntry[] {
    return this.query({ files: [file], limit }).map((r) => r.entry);
  }

  /**
   * Get successful vs failed episodes
   */
  getMemoriesByStatus(success: boolean, limit: number = 10): MemoryEntry[] {
    return this.query({ success, limit }).map((r) => r.entry);
  }

  /**
   * Get memories from a specific node path
   */
  getMemoriesByNode(node: string, limit: number = 5): MemoryEntry[] {
    return this.query({ nodes: [node], limit }).map((r) => r.entry);
  }

  /**
   * Get memories by tag
   */
  getMemoriesByTag(tag: string, limit: number = 5): MemoryEntry[] {
    return this.query({ tags: [tag], limit }).map((r) => r.entry);
  }

  /**
   * Get all memories (sorted by newest first)
   */
  getAllMemories(): MemoryEntry[] {
    return [...this.entries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Get statistics about memory
   */
  getStats(): {
    totalEntries: number;
    successRate: number;
    commonTools: Record<string, number>;
    commonFiles: Record<string, number>;
    commonTags: Record<string, number>;
    averageDuration: number;
    dateRange: { oldest: string; newest: string };
  } {
    if (this.entries.length === 0) {
      return {
        totalEntries: 0,
        successRate: 0,
        commonTools: {},
        commonFiles: {},
        commonTags: {},
        averageDuration: 0,
        dateRange: { oldest: '', newest: '' },
      };
    }

    const successCount = this.entries.filter((e) => e.metadata.success).length;
    const successRate = (successCount / this.entries.length) * 100;

    const commonTools: Record<string, number> = {};
    const commonFiles: Record<string, number> = {};
    const commonTags: Record<string, number> = {};

    for (const entry of this.entries) {
      for (const tool of entry.metadata.toolsUsed) {
        commonTools[tool] = (commonTools[tool] || 0) + 1;
      }
      for (const file of entry.metadata.filesModified) {
        commonFiles[file] = (commonFiles[file] || 0) + 1;
      }
      if (entry.metadata.tags) {
        for (const tag of entry.metadata.tags) {
          commonTags[tag] = (commonTags[tag] || 0) + 1;
        }
      }
    }

    const totalDuration = this.entries.reduce(
      (sum, e) => sum + (e.metadata.duration || 0),
      0
    );
    const averageDuration = totalDuration / this.entries.length;

    const timestamps = this.entries.map((e) => new Date(e.timestamp).getTime());
    const oldest = new Date(Math.min(...timestamps)).toISOString();
    const newest = new Date(Math.max(...timestamps)).toISOString();

    return {
      totalEntries: this.entries.length,
      successRate: Math.round(successRate),
      commonTools: this._topN(commonTools, 10),
      commonFiles: this._topN(commonFiles, 10),
      commonTags: this._topN(commonTags, 10),
      averageDuration: Math.round(averageDuration),
      dateRange: { oldest, newest },
    };
  }

  /**
   * Generate a report of memory insights
   */
  getReport(): string {
    const stats = this.getStats();
    const lines = [
      '',
      '╔════════════════════════════════════════════════════════════╗',
      '║              MEMORY INSIGHTS REPORT                        ║',
      '╚════════════════════════════════════════════════════════════╝',
      '',
      `Total Episodes: ${stats.totalEntries}`,
      `Success Rate: ${stats.successRate}%`,
      `Average Duration: ${stats.averageDuration}ms`,
      `Date Range: ${stats.dateRange.oldest} to ${stats.dateRange.newest}`,
      '',
      'Top Tools Used:',
    ];

    for (const [tool, count] of Object.entries(stats.commonTools).slice(0, 10)) {
      lines.push(`  ${tool}: ${count} times`);
    }

    lines.push('');
    lines.push('Top Files Modified:');
    for (const [file, count] of Object.entries(stats.commonFiles).slice(0, 10)) {
      lines.push(`  ${file}: ${count} times`);
    }

    if (Object.keys(stats.commonTags).length > 0) {
      lines.push('');
      lines.push('Top Tags:');
      for (const [tag, count] of Object.entries(stats.commonTags).slice(0, 10)) {
        lines.push(`  ${tag}: ${count} times`);
      }
    }

    lines.push('');
    lines.push('═'.repeat(62));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Get top N entries from an object
   */
  private _topN(
    obj: Record<string, number>,
    n: number
  ): Record<string, number> {
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {});
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.entries = [];
    this.saveMemory();
    Logger.info('Memory cleared');
  }

  /**
   * Export memories as JSON
   */
  export(): MemoryEntry[] {
    return JSON.parse(JSON.stringify(this.entries));
  }
}

/**
 * Global memory manager instance
 */
let globalMemoryManager: MemoryManager | null = null;

export function createMemoryManager(debugMode: boolean = false): MemoryManager {
  if (!globalMemoryManager) {
    globalMemoryManager = new MemoryManager(debugMode);
  }
  return globalMemoryManager;
}

export function getMemoryManager(): MemoryManager {
  if (!globalMemoryManager) {
    globalMemoryManager = new MemoryManager();
  }
  return globalMemoryManager;
}

export function resetMemoryManager(debugMode: boolean = false): MemoryManager {
  globalMemoryManager = new MemoryManager(debugMode);
  return globalMemoryManager;
}
