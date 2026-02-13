import { describe, it, expect, vi, beforeEach } from 'vitest';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner } from './agentRunner.js';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

async function* asyncIterable<T>(...items: T[]): AsyncGenerator<T, void> {
  for (const item of items) {
    yield item;
  }
}

function makeResultMessage(overrides: Record<string, any> = {}) {
  return {
    type: 'result',
    subtype: 'success',
    result: 'Done',
    total_cost_usd: 0.05,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  };
}

const mockQuery = vi.mocked(query);

describe('AgentRunner', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('calls query() with correct model, permissionMode, and systemPrompt', async () => {
    mockQuery.mockReturnValue(asyncIterable(makeResultMessage()) as any);

    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toBe('hello');
    expect(callArgs.options?.systemPrompt).toBe('you are a bot');
    expect(callArgs.options?.model).toBe('claude-opus-4-6');
    expect(callArgs.options?.permissionMode).toBe('default');
    expect(callArgs.options?.maxTurns).toBe(25);
    expect(callArgs.options?.cwd).toBe('/tmp/test');
  });

  it('forwards assistant text blocks to onOutput callback', async () => {
    mockQuery.mockReturnValue(asyncIterable(
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello world' },
            { type: 'tool_use', name: 'Read' },
            { type: 'text', text: 'Second block' },
          ],
        },
      },
      makeResultMessage(),
    ) as any);

    const onOutput = vi.fn().mockResolvedValue(undefined);
    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput,
      workingDir: '/tmp/test',
    });

    expect(onOutput).toHaveBeenCalledWith('test-1', 'Hello world');
    expect(onOutput).toHaveBeenCalledWith('test-1', 'Second block');
    expect(onOutput).toHaveBeenCalledTimes(2);
  });

  it('extracts cost and token counts from result message', async () => {
    mockQuery.mockReturnValue(asyncIterable(
      makeResultMessage({
        total_cost_usd: 0.12,
        usage: { input_tokens: 500, output_tokens: 200 },
      }),
    ) as any);

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(result.success).toBe(true);
    expect(result.costUsd).toBe(0.12);
    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(200);
  });

  it('reports error result as failure', async () => {
    mockQuery.mockReturnValue(asyncIterable(
      makeResultMessage({
        subtype: 'error_during_execution',
        result: undefined,
        errors: ['Something broke'],
      }),
    ) as any);

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(result.success).toBe(false);
    expect(result.summary).toContain('Something broke');
  });

  it('returns timeout failure when agent exceeds time limit', async () => {
    async function* neverResolve(): AsyncGenerator<any, void> {
      await new Promise(() => {}); // Never resolves
    }
    mockQuery.mockReturnValue(neverResolve() as any);

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
      timeout: 0.01, // 10ms
    });

    expect(result.success).toBe(false);
    expect(result.summary).toContain('timed out');
  });

  it('passes MCP servers as native config object to query()', async () => {
    mockQuery.mockReturnValue(asyncIterable(makeResultMessage()) as any);

    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
      mcpServers: [
        { name: 'myserver', command: 'node', args: ['server.js'], env: { FOO: 'bar' } },
      ],
    });

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options?.mcpServers).toEqual({
      myserver: { command: 'node', args: ['server.js'], env: { FOO: 'bar' } },
    });
  });

  it('returns "No output" when agent produces no text', async () => {
    mockQuery.mockReturnValue(asyncIterable(
      makeResultMessage({ result: '' }),
    ) as any);

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(result.summary).toBe('No output');
  });

  it('catches thrown errors and returns failure', async () => {
    mockQuery.mockImplementation(() => {
      throw new Error('SDK connection failed');
    });

    const runner = new AgentRunner();
    const result = await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(result.success).toBe(false);
    expect(result.summary).toContain('SDK connection failed');
  });
});
