import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner } from './agentRunner.js';
import { DEFAULT_MODEL } from '../utils/constants.js';

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
    expect(callArgs.options?.model).toBe(DEFAULT_MODEL);
    expect(callArgs.options?.permissionMode).toBe('bypassPermissions');
    expect(callArgs.options?.maxTurns).toBe(40);
    expect(callArgs.options?.cwd).toBe('/tmp/test');
    expect(callArgs.options?.effort).toBe('high');
    expect(callArgs.options?.thinking).toEqual({ type: 'adaptive' });
    expect(callArgs.options?.maxBudgetUsd).toBe(2.0);
  });

  it('uses max effort and higher budget for complex tasks', async () => {
    mockQuery.mockReturnValue(asyncIterable(makeResultMessage()) as any);

    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-complex',
      prompt: 'build complex app',
      systemPrompt: 'you are a bot',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
      complexity: 20,
    });

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options?.effort).toBe('max');
    expect(callArgs.options?.maxBudgetUsd).toBe(5.0);
    expect(callArgs.options?.thinking).toEqual({ type: 'adaptive' });
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
      } as any,
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

  it('captures stderr in production mode', async () => {
    const origPath = process.env.ELISA_RESOURCES_PATH;
    process.env.ELISA_RESOURCES_PATH = '/fake/resources';
    try {
      mockQuery.mockReturnValue(asyncIterable(makeResultMessage()) as any);

      const runner = new AgentRunner();
      await runner.execute({
        taskId: 'test-1',
        prompt: 'hello',
        systemPrompt: 'you are a bot',
        onOutput: vi.fn().mockResolvedValue(undefined),
        workingDir: '/tmp/test',
      });

      const callArgs = mockQuery.mock.calls[0][0];
      expect(typeof callArgs.options?.stderr).toBe('function');
      // No executable override -- uses system node via SDK default
      expect(callArgs.options?.executable).toBeUndefined();
    } finally {
      if (origPath === undefined) delete process.env.ELISA_RESOURCES_PATH;
      else process.env.ELISA_RESOURCES_PATH = origPath;
    }
  });

  it('does not capture stderr in dev mode', async () => {
    const origPath = process.env.ELISA_RESOURCES_PATH;
    delete process.env.ELISA_RESOURCES_PATH;
    try {
      mockQuery.mockReturnValue(asyncIterable(makeResultMessage()) as any);

      const runner = new AgentRunner();
      await runner.execute({
        taskId: 'test-1',
        prompt: 'hello',
        systemPrompt: 'you are a bot',
        onOutput: vi.fn().mockResolvedValue(undefined),
        workingDir: '/tmp/test',
      });

      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options?.executable).toBeUndefined();
      expect(callArgs.options?.env).toBeUndefined();
    } finally {
      if (origPath !== undefined) process.env.ELISA_RESOURCES_PATH = origPath;
    }
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

// ---------------------------------------------------------------------------
// Regression coverage for the 0.3.x native-binary resolver. `resolveClaudeCodePath`
// runs once at module load, so each case re-imports the module with a clean
// registry and a controlled ELISA_RESOURCES_PATH. The SDK is mocked at the top of
// this file, so importing agentRunner.js never touches the real SDK.
// ---------------------------------------------------------------------------
describe('getClaudeCodePath (native binary resolution)', () => {
  const BIN_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const NATIVE_SUBPATH = `claude-agent-sdk-${process.platform}-${process.arch}`;

  beforeEach(() => {
    vi.resetModules();
  });

  it('dev mode (no ELISA_RESOURCES_PATH): resolves the host-platform native binary', async () => {
    const orig = process.env.ELISA_RESOURCES_PATH;
    delete process.env.ELISA_RESOURCES_PATH;
    try {
      const { getClaudeCodePath } = await import('./agentRunner.js');
      const resolved = getClaudeCodePath();
      // The native optional dep is installed for the host arch, so the dev
      // branch should resolve it to the per-platform package's binary.
      expect(resolved).toBeDefined();
      expect(resolved).toContain(NATIVE_SUBPATH);
      expect(resolved!.endsWith(BIN_NAME)).toBe(true);
    } finally {
      if (orig === undefined) delete process.env.ELISA_RESOURCES_PATH;
      else process.env.ELISA_RESOURCES_PATH = orig;
    }
  });

  it('prod mode: resolves the binary under ELISA_RESOURCES_PATH/backend-dist/node_modules', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-agentrunner-prod-'));
    const binDir = path.join(tmpRoot, 'backend-dist', 'node_modules', '@anthropic-ai', NATIVE_SUBPATH);
    fs.mkdirSync(binDir, { recursive: true });
    const binPath = path.join(binDir, BIN_NAME);
    fs.writeFileSync(binPath, '#!/bin/sh\n');

    const orig = process.env.ELISA_RESOURCES_PATH;
    process.env.ELISA_RESOURCES_PATH = tmpRoot;
    try {
      const { getClaudeCodePath } = await import('./agentRunner.js');
      expect(getClaudeCodePath()).toBe(binPath);
    } finally {
      if (orig === undefined) delete process.env.ELISA_RESOURCES_PATH;
      else process.env.ELISA_RESOURCES_PATH = orig;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('prod mode with missing prod binary: falls through to dev resolution of the native binary', async () => {
    // ELISA_RESOURCES_PATH set but no binary at the prod path -> the resolver
    // must fall through to the host-platform optional dep (not return the bad path).
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-agentrunner-fallthrough-'));
    const orig = process.env.ELISA_RESOURCES_PATH;
    process.env.ELISA_RESOURCES_PATH = tmpRoot;
    try {
      const { getClaudeCodePath } = await import('./agentRunner.js');
      const resolved = getClaudeCodePath();
      expect(resolved).toBeDefined();
      expect(resolved).toContain(NATIVE_SUBPATH);
      expect(resolved).not.toContain(tmpRoot);
    } finally {
      if (orig === undefined) delete process.env.ELISA_RESOURCES_PATH;
      else process.env.ELISA_RESOURCES_PATH = orig;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
