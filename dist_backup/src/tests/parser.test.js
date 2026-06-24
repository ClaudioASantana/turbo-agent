"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const parser_1 = require("../parser");
(0, vitest_1.describe)('extractToolCalls', () => {
    (0, vitest_1.it)('should parse clean JSON', () => {
        const input = `{"tool": "read_file", "args": {"filePath": "test.txt"}}`;
        const result = (0, parser_1.extractToolCalls)(input);
        (0, vitest_1.expect)(result).toEqual({ tool: 'read_file', args: { filePath: 'test.txt' } });
    });
    (0, vitest_1.it)('should parse JSON wrapped in markdown', () => {
        const input = "Here is my tool call:\n```json\n{\"tool\": \"test\", \"args\": {}}\n```";
        const result = (0, parser_1.extractToolCalls)(input);
        (0, vitest_1.expect)(result).toEqual({ tool: 'test', args: {} });
    });
    (0, vitest_1.it)('should parse JSON mixed with conversational text', () => {
        const input = "I will now read the file.\n{\"tool\": \"test\", \"args\": {}}\nPlease wait.";
        const result = (0, parser_1.extractToolCalls)(input);
        (0, vitest_1.expect)(result).toEqual({ tool: 'test', args: {} });
    });
    (0, vitest_1.it)('should ignore <think> tags', () => {
        const input = "<think>\nLet's decide what to do.\nI should output JSON.\n</think>\n{\"tool\": \"test_think\", \"args\": {}}";
        const result = (0, parser_1.extractToolCalls)(input);
        (0, vitest_1.expect)(result).toEqual({ tool: 'test_think', args: {} });
    });
    (0, vitest_1.it)('should handle unescaped newlines in conversational JSON fallback', () => {
        // Our fallback parser `sanitizeJSONString` handles some unescaped newlines inside strings if they're broken.
        const input = "```json\n{\"tool\": \"test\", \"args\": {\"text\": \"line1\nline2\"}}\n```";
        const result = (0, parser_1.extractToolCalls)(input);
        (0, vitest_1.expect)(result).toEqual({ tool: 'test', args: { text: "line1\nline2" } });
    });
    (0, vitest_1.it)('should return null for invalid JSON', () => {
        const input = "This is just conversational text.";
        const result = (0, parser_1.extractToolCalls)(input);
        (0, vitest_1.expect)(result).toBeNull();
    });
});
