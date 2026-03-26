/** Tests for retry behavior: failure context, increasing maxTurns (#103). */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../prompts/builderAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Build the thing'),
}));

vi.mock('../../prompts/testerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a tester.',
  formatTaskPrompt: vi.fn().mockReturnValue('Test the thing'),
}));

vi.mock('../../prompts/reviewerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a reviewer.',
  formatTaskPrompt: vi.fn().mockReturnValue('Review the thing'),
}));

import { ExecutePhase } from './executePhase.js';
import type { ExecuteDeps } from './executePhase.js';
import { TaskDAG } from '../../utils/dag.js';
import { ContextManager } from '../../utils/contextManager.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import { MAX_TURNS_DEFAULT, MAX_TURNS_RETRY_INCREMENT } from '../../utils/constants.js';
import type { PhaseContext } from './types.js';

// -- Helpers --

let nuggetDir: string;
let events: Record<string, any>[];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-retry-'));
}

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: {
      id: 'test-session',
      state: 'idle',
      spec: { nugget: { goal: 'test goal', type: 'software', description: 'test desc' } },
      tasks: [],
      agents: [],
    } as any,
    send: async (evt: Record<string, any>) => { events.push(evt); },
    logger: null,
    nuggetDir,
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function makeTask(id: string, name: string, agentName: string, deps: string[] = []) {
  return {
    id, name,
    description: `Do ${name}`,
    status: 'pending',
    agent_name: agentName,
    dependencies: deps,
    acceptance_criteria: [`${name} done`],
  };
}

function makeAgent(name: string, role = 'builder') {
  return { name, role, persona: 'helpful', status: 'idle' };
}

function makeSuccessResult(overrides: Record<string, any> = {}) {
  return {
    success: true,
    summary: 'Task completed successfully with all requirements met and verified',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
    ...overrides,
  };
}

function makeDeps(
  executeMock: ReturnType<typeof vi.fn>,
  overrides: Partial<ExecuteDeps> = {},
): ExecuteDeps {
  const tasks = overrides.tasks ?? [];
  const agents = overrides.agents ?? [];
  const taskMap: Record<string, Record<string, any>> = {};
  for (const t of tasks) taskMap[t.id] = t;
  const agentMap: Record<string, Record<string, any>> = {};
  for (const a of agents) agentMap[a.name] = a;
  const dag = overrides.dag ?? new TaskDAG();
  if (!overrides.dag) {
    for (const t of tasks) dag.addTask(t.id, t.dependencies ?? []);
  }

  return {
    agentRunner: { execute: executeMock } as any,
    git: overrides.git ?? null,
    teachingEngine: { getMoment: vi.fn().mockResolvedValue(null) } as any,
    tokenTracker: overrides.tokenTracker ?? new TokenTracker(),
    portalService: { getMcpServers: vi.fn().mockReturnValue([]) } as any,
    context: new ContextManager(),
    tasks,
    agents,
    taskMap: overrides.taskMap ?? taskMap,
    agentMap: overrides.agentMap ?? agentMap,
    dag,
    questionResolvers: new Map(),
    gateResolver: { current: null },
    ...overrides,
  };
}

// -- Setup / Teardown --

beforeEach(() => {
  vi.clearAllMocks();
  nuggetDir = makeTempDir();
  events = [];
});

afterEach(() => {
  try {
    fs.rmSync(nuggetDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ============================================================
// maxTurns progression (#103)
// ============================================================

describe('maxTurns progression (#103)', () => {
  it('first attempt uses MAX_TURNS_DEFAULT (25)', async () => {
    const capturedMaxTurns: number[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedMaxTurns.push(opts.maxTurns);
      return makeSuccessResult();
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    expect(capturedMaxTurns[0]).toBe(MAX_TURNS_DEFAULT);
  });

  it('retry 1 uses 35 turns, retry 2 uses 45 turns', async () => {
    const capturedMaxTurns: number[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedMaxTurns.push(opts.maxTurns);
      // Fail first two attempts, succeed on third
      if (capturedMaxTurns.length <= 2) {
        return { success: false, summary: 'Failed attempt', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return makeSuccessResult();
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    expect(capturedMaxTurns).toEqual([
      MAX_TURNS_DEFAULT,                                      // attempt 0: 25
      MAX_TURNS_DEFAULT + MAX_TURNS_RETRY_INCREMENT,          // retry 1: 35
      MAX_TURNS_DEFAULT + 2 * MAX_TURNS_RETRY_INCREMENT,     // retry 2: 45
    ]);
  });
});

// ============================================================
// Retry prompt includes failure context (#103)
// ============================================================

describe('retry prompt failure context (#103)', () => {
  it('retry prompt includes failure context header', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      if (capturedPrompts.length === 1) {
        return { success: false, summary: 'First attempt failed', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return makeSuccessResult();
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // First attempt should NOT have retry context
    expect(capturedPrompts[0]).not.toContain('Retry Attempt');

    // Second attempt should have retry context
    expect(capturedPrompts[1]).toContain('## Retry Attempt 1');
    expect(capturedPrompts[1]).toContain('previous attempt');
    expect(capturedPrompts[1]).toContain('Skip orientation');
  });

  it('non-retry prompt does NOT include failure context', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.prompt);
      return makeSuccessResult();
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    expect(capturedPrompts[0]).not.toContain('Retry Attempt');
    expect(capturedPrompts[0]).not.toContain('previous attempt');
  });
});

// ============================================================
// agentRunner defaults to MAX_TURNS_DEFAULT constant (#103)
// ============================================================

describe('agentRunner defaults to MAX_TURNS_DEFAULT', () => {
  it('MAX_TURNS_DEFAULT equals 40', () => {
    expect(MAX_TURNS_DEFAULT).toBe(40);
  });

  it('MAX_TURNS_RETRY_INCREMENT equals 15', () => {
    expect(MAX_TURNS_RETRY_INCREMENT).toBe(15);
  });
});
