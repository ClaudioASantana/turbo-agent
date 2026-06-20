import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, ErrorCategory } from '../tools';

describe('ToolRegistry Execution', () => {
  beforeAll(() => {
    ToolRegistry.register({
      name: 'test_tool',
      description: 'A test tool',
      schema: z.object({
        requiredParam: z.string(),
      }),
      execute: (args) => {
        return { success: true, result: args.requiredParam };
      }
    });

    ToolRegistry.register({
      name: 'failing_tool',
      description: 'A tool that throws',
      schema: z.object({}),
      execute: () => {
        throw new Error("Internal failure");
      }
    });
  });

  it('should execute successfully and inject durationMs', async () => {
    const res = await ToolRegistry.execute('test_tool', { requiredParam: 'hello' });
    expect(res.success).toBe(true);
    expect(res.result).toBe('hello');
    expect(typeof res.durationMs).toBe('number');
  });

  it('should return VALIDATION error if arguments are missing', async () => {
    const res = await ToolRegistry.execute('test_tool', {}); // missing requiredParam
    expect(res.success).toBe(false);
    expect(res.category).toBe(ErrorCategory.VALIDATION);
    expect(res.error).toContain('Validation Error');
    expect(typeof res.durationMs).toBe('number');
  });

  it('should return EXECUTION error if tool throws internally', async () => {
    const res = await ToolRegistry.execute('failing_tool', {});
    expect(res.success).toBe(false);
    expect(res.category).toBe(ErrorCategory.EXECUTION);
    expect(res.error).toBe('Internal failure');
    expect(typeof res.durationMs).toBe('number');
  });

  it('should return VALIDATION error if tool does not exist', async () => {
    const res = await ToolRegistry.execute('non_existent_tool', {});
    expect(res.success).toBe(false);
    expect(res.category).toBe(ErrorCategory.VALIDATION);
    expect(res.error).toContain('Tool non_existent_tool not found');
  });
});
