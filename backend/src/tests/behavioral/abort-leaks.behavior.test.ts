/** Behavioral tests for #75 (abort signal propagation) and #76 (resource leaks). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- Mock SDK before importing agentRunner --
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner } from '../../services/agentRunner.js';
import { SessionLogger } from '../../utils/sessionLogger.js';
import { ContextManager } from '../../utils/contextManager.js';
import { SessionStore } from '../../services/sessionStore.js';

const mockQuery = vi.mocked(query);

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

// ============================================================
// #75: AbortSignal propagation to Agent SDK
// ============================================================

describe('AbortSignal propagation (#75)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('links external abortSignal to internal AbortController', async () => {
    let capturedAbortController: AbortController | undefined;
    mockQuery.mockImplementation((opts: any) => {
      capturedAbortController = opts.options?.abortController;
      return asyncIterable(makeResultMessage()) as any;
    });

    const externalController = new AbortController();
    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'system',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
      abortSignal: externalController.signal,
    });

    expect(capturedAbortController).toBeDefined();
    expect(capturedAbortController!.signal.aborted).toBe(false);

    // Abort the external signal -> internal controller should follow
    externalController.abort();
    expect(capturedAbortController!.signal.aborted).toBe(true);
  });

  it('does not abort internal controller when no external signal provided', async () => {
    let capturedAbortController: AbortController | undefined;
    mockQuery.mockImplementation((opts: any) => {
      capturedAbortController = opts.options?.abortController;
      return asyncIterable(makeResultMessage()) as any;
    });

    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'system',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
    });

    expect(capturedAbortController).toBeDefined();
    expect(capturedAbortController!.signal.aborted).toBe(false);
  });

  it('already-aborted external signal immediately aborts internal controller', async () => {
    let capturedAbortController: AbortController | undefined;
    mockQuery.mockImplementation((opts: any) => {
      capturedAbortController = opts.options?.abortController;
      return asyncIterable(makeResultMessage()) as any;
    });

    const externalController = new AbortController();
    externalController.abort(); // Already aborted

    const runner = new AgentRunner();
    await runner.execute({
      taskId: 'test-1',
      prompt: 'hello',
      systemPrompt: 'system',
      onOutput: vi.fn().mockResolvedValue(undefined),
      workingDir: '/tmp/test',
      abortSignal: externalController.signal,
    });

    expect(capturedAbortController!.signal.aborted).toBe(true);
  });
});

// ============================================================
// #76: SessionLogger close() releases streams
// ============================================================

describe('SessionLogger close() releases streams (#76)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-logger-leak-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('close() ends both write streams and flushes content', async () => {
    const logger = new SessionLogger(tmpDir);
    logger.info('test entry');
    logger.close();

    await new Promise((r) => setTimeout(r, 50));

    const jsonlPath = path.join(tmpDir, '.elisa', 'logs', 'session.jsonl');
    const logPath = path.join(tmpDir, '.elisa', 'logs', 'session.log');
    expect(fs.existsSync(jsonlPath)).toBe(true);
    expect(fs.existsSync(logPath)).toBe(true);

    const jsonlContent = fs.readFileSync(jsonlPath, 'utf-8');
    expect(jsonlContent).toContain('test entry');
  });

  it('close() is idempotent (no throw on double close)', () => {
    const logger = new SessionLogger(tmpDir);
    logger.info('entry');
    expect(() => {
      logger.close();
      logger.close();
    }).not.toThrow();
  });
});

// ============================================================
// #76: contextManager buildFileManifest FD leak prevention
// ============================================================

describe('contextManager buildFileManifest FD safety (#76)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-ctx-fd-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('closes FD in finally block when readSync throws', () => {
    const testFile = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(testFile, 'hello world');

    // Track closeSync calls with the real fd from openSync
    const originalOpenSync = fs.openSync;
    const originalCloseSync = fs.closeSync;
    let openedFd: number | undefined;
    let closedFds: number[] = [];

    vi.spyOn(fs, 'openSync').mockImplementation((...args: any[]) => {
      const fd = originalOpenSync.apply(fs, args as any);
      openedFd = fd;
      return fd;
    });

    vi.spyOn(fs, 'readSync').mockImplementation(() => {
      throw new Error('Simulated read error');
    });

    vi.spyOn(fs, 'closeSync').mockImplementation((fd: number) => {
      closedFds.push(fd);
      return originalCloseSync(fd);
    });

    const manifest = ContextManager.buildFileManifest(tmpDir);
    expect(manifest).toBeDefined();
    // The FD that was opened should have been closed in the finally block
    expect(openedFd).toBeDefined();
    expect(closedFds).toContain(openedFd);
  });

  it('produces manifest with file hints when no errors occur', () => {
    const testFile = path.join(tmpDir, 'hello.js');
    fs.writeFileSync(testFile, '// JavaScript file\nconsole.log("hi");');

    const manifest = ContextManager.buildFileManifest(tmpDir);
    expect(manifest).toContain('hello.js');
    // The hint is prefixed with "  # " in the manifest
    expect(manifest).toContain('# // JavaScript file');
  });
});

// ============================================================
// #76: ConnectionManager cleanup via SessionStore onCleanup
// ============================================================

describe('ConnectionManager cleanup via SessionStore (#76)', () => {
  it('onCleanup callback is invoked when scheduleCleanup fires', async () => {
    const store = new SessionStore(false);
    const cleanedIds: string[] = [];
    store.onCleanup = (id: string) => cleanedIds.push(id);

    store.create('session-1', {
      id: 'session-1',
      state: 'done',
      tasks: [],
      agents: [],
    } as any);

    store.scheduleCleanup('session-1', 50);
    await new Promise((r) => setTimeout(r, 200));

    expect(cleanedIds).toContain('session-1');
    expect(store.has('session-1')).toBe(false);
  });

  it('onCleanup callback is invoked during pruneStale', async () => {
    const store = new SessionStore(false);
    const cleanedIds: string[] = [];
    store.onCleanup = (id: string) => cleanedIds.push(id);

    store.create('session-old', {
      id: 'session-old',
      state: 'done',
      tasks: [],
      agents: [],
    } as any);

    // Wait 2ms so that the session age > 1ms threshold
    await new Promise((r) => setTimeout(r, 2));
    store.pruneStale(1);

    expect(cleanedIds).toContain('session-old');
    expect(store.has('session-old')).toBe(false);
  });
});

// ============================================================
// #75/#76: Orchestrator sets state to 'done' on error
// ============================================================

describe('Orchestrator error handling (#75/#76)', () => {
  it('sets session state to done when run() throws', async () => {
    const { Orchestrator } = await import('../../services/orchestrator.js');

    const session = {
      id: 'test-session',
      state: 'idle',
      spec: null,
      tasks: [],
      agents: [],
    } as any;

    const sentEvents: Record<string, any>[] = [];
    const sendEvent = async (evt: Record<string, any>) => { sentEvents.push(evt); };

    const orchestrator = new Orchestrator(session, sendEvent);

    // run() with an invalid spec should cause an error during planning
    await orchestrator.run({ invalid: true });

    expect(session.state).toBe('done');

    const errorEvents = sentEvents.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
  });
});
