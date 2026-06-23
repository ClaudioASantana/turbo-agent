"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const zod_1 = require("zod");
const tools_1 = require("../tools");
(0, vitest_1.describe)('ToolRegistry Execution', () => {
    (0, vitest_1.beforeAll)(() => {
        tools_1.ToolRegistry.register({
            name: 'test_tool',
            description: 'A test tool',
            schema: zod_1.z.object({
                requiredParam: zod_1.z.string(),
            }),
            execute: (args) => {
                return { success: true, result: args.requiredParam };
            }
        });
        tools_1.ToolRegistry.register({
            name: 'failing_tool',
            description: 'A tool that throws',
            schema: zod_1.z.object({}),
            execute: () => {
                throw new Error("Internal failure");
            }
        });
    });
    (0, vitest_1.it)('should execute successfully and inject durationMs', async () => {
        const res = await tools_1.ToolRegistry.execute('test_tool', { requiredParam: 'hello' });
        (0, vitest_1.expect)(res.success).toBe(true);
        (0, vitest_1.expect)(res.result).toBe('hello');
        (0, vitest_1.expect)(typeof res.durationMs).toBe('number');
    });
    (0, vitest_1.it)('should return VALIDATION error if arguments are missing', async () => {
        const res = await tools_1.ToolRegistry.execute('test_tool', {}); // missing requiredParam
        (0, vitest_1.expect)(res.success).toBe(false);
        (0, vitest_1.expect)(res.category).toBe(tools_1.ErrorCategory.VALIDATION);
        (0, vitest_1.expect)(res.error).toContain('Validation Error');
        (0, vitest_1.expect)(typeof res.durationMs).toBe('number');
    });
    (0, vitest_1.it)('should return EXECUTION error if tool throws internally', async () => {
        const res = await tools_1.ToolRegistry.execute('failing_tool', {});
        (0, vitest_1.expect)(res.success).toBe(false);
        (0, vitest_1.expect)(res.category).toBe(tools_1.ErrorCategory.EXECUTION);
        (0, vitest_1.expect)(res.error).toBe('Internal failure');
        (0, vitest_1.expect)(typeof res.durationMs).toBe('number');
    });
    (0, vitest_1.it)('should return VALIDATION error if tool does not exist', async () => {
        const res = await tools_1.ToolRegistry.execute('non_existent_tool', {});
        (0, vitest_1.expect)(res.success).toBe(false);
        (0, vitest_1.expect)(res.category).toBe(tools_1.ErrorCategory.VALIDATION);
        (0, vitest_1.expect)(res.error).toContain('Tool non_existent_tool not found');
    });
});
