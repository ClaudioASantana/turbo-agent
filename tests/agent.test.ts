import { describe, it, expect } from 'vitest';
import { Agent } from '../src/agent';

describe('Agent Core', () => {
  it('should instantiate successfully with a custom threadId', () => {
    const threadId = 'test_thread_123';
    const agent = new Agent('.test_history.json', 10, 10, false, 'generic', threadId);
    expect(agent).toBeDefined();
    // In a real test, we would mock PostgresSaver and pg Pool
  });
});
