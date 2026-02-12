/** Behavioral tests for ExecutePhase.
 *
 * Tests workspace setup, single/parallel task execution, summary validation,
 * retry logic, and context chain updates. AgentRunner is mocked;
 * ExecutePhase control flow runs for real.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- Module mocks (hoisted) --

vi.mock('../../services/agentRunner.js', () => ({
  AgentRunner: vi.fn(),
}));

vi.mock('../../services/gitService.js', () => ({
  GitService: vi.fn(),
}));

vi.mock('../../services/teachingEngine.js', () => ({
  TeachingEngine: vi.fn(),
}));

vi.mock('../../services/portalService.js', () => ({
  PortalService: vi.fn(),
}));

vi.mock('../../prompts/builderAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a {persona} agent. Task: {task_id}. Goal: {nugget_goal}. Type: {nugget_type}. Desc: {nugget_description}. Paths: {allowed_paths}. Restricted: {restricted_paths}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Build the thing'),
}));

vi.mock('../../prompts/testerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a tester. Task: {task_id}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Test the thing'),
}));

vi.mock('../../prompts/reviewerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a reviewer. Task: {task_id}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Review the thing'),
}));

import { ExecutePhase } from '../../services/phases/executePhase.js';
import type { ExecuteDeps } from '../../services/phases/executePhase.js';
import { TaskDAG } from '../../utils/dag.js';
import { ContextManager } from '../../utils/contextManager.js';
import type { PhaseContext } from '../../services/phases/types.js';
import type { BuildSession } from '../../models/session.js';

// -- Helpers --

let nuggetDir: string;
let events: Record<string, any>[];

/** Default mock for agentRunner.execute -- always succeeds. */
function makeExecuteMock() {
  return vi.fn().mockResolvedValue({
    success: true,
    summary: 'Task completed successfully with all requirements met and verified by automated checks',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
  });
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-exec-'));
}

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: {
      id: 'test-session',
      state: 'idle',
      spec: { nugget: { goal: 'test goal', type: 'software', description: 'test desc' } },
      tasks: [],
      agents: [],
    } as unknown as BuildSession,
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
    id,
    name,
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
    git: null,
    teachingEngine: { getMoment: vi.fn().mockResolvedValue(null) } as any,
    tokenTracker: { addForAgent: vi.fn() } as any,
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
    // ignore cleanup errors on Windows
  }
});

// ============================================================
// Workspace setup
// ============================================================

describe('workspace setup', () => {
  it('creates required directories and CLAUDE.md', async () => {
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const expectedDirs = [
      path.join(nuggetDir, '.elisa', 'comms'),
      path.join(nuggetDir, '.elisa', 'context'),
      path.join(nuggetDir, '.elisa', 'status'),
      path.join(nuggetDir, 'src'),
      path.join(nuggetDir, 'tests'),
    ];
    for (const dir of expectedDirs) {
      expect(fs.existsSync(dir), `Expected directory to exist: ${dir}`).toBe(true);
    }

    const claudeMd = path.join(nuggetDir, 'CLAUDE.md');
    expect(fs.existsSync(claudeMd)).toBe(true);
    const content = fs.readFileSync(claudeMd, 'utf-8');
    expect(content).toContain('Workspace Rules');
  });

  it('emits workspace_created event', async () => {
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const wsEvents = events.filter((e) => e.type === 'workspace_created');
    expect(wsEvents.length).toBe(1);
    expect(wsEvents[0].nugget_dir).toBe(nuggetDir);
  });
});

// ============================================================
// Single task execution
// ============================================================

describe('single task execution', () => {
  it('transitions task from pending to in_progress to done', async () => {
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    expect(task.status).toBe('done');
  });

  it('emits task_started and task_completed events', async () => {
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const started = events.filter((e) => e.type === 'task_started');
    const completed = events.filter((e) => e.type === 'task_completed');
    expect(started.length).toBe(1);
    expect(started[0].task_id).toBe('task-1');
    expect(started[0].agent_name).toBe('Builder Bot');
    expect(completed.length).toBe(1);
    expect(completed[0].task_id).toBe('task-1');
  });

  it('emits token_usage event', async () => {
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const tokenEvents = events.filter((e) => e.type === 'token_usage');
    expect(tokenEvents.length).toBe(1);
    expect(tokenEvents[0].agent_name).toBe('Builder Bot');
    expect(tokenEvents[0].input_tokens).toBe(100);
    expect(tokenEvents[0].output_tokens).toBe(50);
  });
});

// ============================================================
// Parallel execution
// ============================================================

describe('parallel execution', () => {
  it('dispatches independent tasks concurrently', async () => {
    const executionLog: { taskId: string; event: string; time: number }[] = [];
    const start = Date.now();

    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      executionLog.push({ taskId: opts.taskId, event: 'start', time: Date.now() - start });
      await new Promise((r) => setTimeout(r, 50));
      executionLog.push({ taskId: opts.taskId, event: 'end', time: Date.now() - start });
      return {
        success: true,
        summary: `Completed ${opts.taskId} with full implementation and tests passing`,
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      };
    });

    const tasks = [
      makeTask('task-1', 'Build A', 'Agent-A'),
      makeTask('task-2', 'Build B', 'Agent-B'),
      makeTask('task-3', 'Build C', 'Agent-C'),
    ];
    const agents = [
      makeAgent('Agent-A'),
      makeAgent('Agent-B'),
      makeAgent('Agent-C'),
    ];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // All 3 tasks should have been started
    const startedEvents = events.filter((e) => e.type === 'task_started');
    expect(startedEvents.length).toBe(3);

    // Verify all completed
    const completedEvents = events.filter((e) => e.type === 'task_completed');
    expect(completedEvents.length).toBe(3);

    // Check that tasks started roughly concurrently by verifying
    // at least 2 tasks started before any ended
    const startEvents = executionLog.filter((e) => e.event === 'start');
    const firstEnd = executionLog.find((e) => e.event === 'end');
    const startsBeforeFirstEnd = startEvents.filter(
      (e) => e.time <= (firstEnd?.time ?? Infinity),
    );
    expect(startsBeforeFirstEnd.length).toBeGreaterThanOrEqual(2);
  });

  it('respects DAG dependencies: task-2 starts only after task-1 completes', async () => {
    const executionOrder: string[] = [];

    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      executionOrder.push(opts.taskId);
      return {
        success: true,
        summary: `Completed ${opts.taskId} with thorough implementation verified against acceptance criteria`,
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      };
    });

    const tasks = [
      makeTask('task-1', 'Setup', 'Builder Bot'),
      makeTask('task-2', 'Build on setup', 'Builder Bot', ['task-1']),
    ];
    const agents = [makeAgent('Builder Bot')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // task-1 must execute before task-2
    expect(executionOrder.indexOf('task-1')).toBeLessThan(
      executionOrder.indexOf('task-2'),
    );

    // Verify via events too
    const task1CompleteIdx = events.findIndex(
      (e) => e.type === 'task_completed' && e.task_id === 'task-1',
    );
    const task2StartIdx = events.findIndex(
      (e) => e.type === 'task_started' && e.task_id === 'task-2',
    );
    expect(task2StartIdx).toBeGreaterThan(task1CompleteIdx);
  });
});

// ============================================================
// Summary validation
// ============================================================

describe('summary validation', () => {
  it('applies fallback text when agent returns empty summary', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      summary: '',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const result = await phase.execute(ctx);

    expect(result.taskSummaries['task-1']).toBe(
      'Agent did not provide a detailed summary for this task.',
    );
  });

  it('truncates summary exceeding 1000 words to 500 words', async () => {
    const longSummary = Array(1100).fill('word').join(' ');
    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      summary: longSummary,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const result = await phase.execute(ctx);

    const words = result.taskSummaries['task-1'].split(/\s+/).filter(Boolean);
    // 500 words + "[truncated]" = 501
    expect(words.length).toBeLessThanOrEqual(501);
    expect(result.taskSummaries['task-1']).toContain('[truncated]');
  });
});

// ============================================================
// Task retry
// ============================================================

describe('task retry', () => {
  it('retries on failure and succeeds on second attempt', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce({
        success: false,
        summary: 'Failed first attempt due to compilation error in module A',
        inputTokens: 50,
        outputTokens: 20,
        costUsd: 0.005,
      })
      .mockResolvedValueOnce({
        success: true,
        summary: 'Succeeded on retry with fixed compilation and all tests passing correctly',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const result = await phase.execute(ctx);

    expect(task.status).toBe('done');
    expect(result.taskSummaries['task-1']).toContain('Succeeded on retry');

    // Should have task_completed, not task_failed
    const completed = events.filter((e) => e.type === 'task_completed');
    expect(completed.length).toBe(1);
    const failed = events.filter((e) => e.type === 'task_failed');
    expect(failed.length).toBe(0);
  });

  it('fails after all 3 attempts exhausted and emits task_failed', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: false,
      summary: 'Persistent failure that could not be resolved after multiple attempts at debugging',
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.005,
    });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();

    // The phase will try to fire a human gate on max retries.
    // We need to resolve the gate promise to avoid hanging.
    const phase = new ExecutePhase(deps);
    const runPromise = phase.execute(ctx);

    // Wait for human_gate event, then resolve it
    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === 'human_gate')).toBe(true);
      },
      { timeout: 5000 },
    );

    // Approve gate to unblock
    expect(deps.gateResolver.current).not.toBeNull();
    deps.gateResolver.current!({ approved: true });

    await runPromise;

    expect(task.status).toBe('failed');

    const failedEvents = events.filter((e) => e.type === 'task_failed');
    expect(failedEvents.length).toBe(1);
    expect(failedEvents[0].task_id).toBe('task-1');
    expect(failedEvents[0].retry_count).toBe(3);

    // Agent should have been called 3 times (initial + 2 retries)
    expect(executeMock).toHaveBeenCalledTimes(3);
  });
});

// ============================================================
// Context chain
// ============================================================

describe('context chain', () => {
  it('writes nugget_context.md after task completes', async () => {
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const contextPath = path.join(nuggetDir, '.elisa', 'context', 'nugget_context.md');
    expect(fs.existsSync(contextPath)).toBe(true);
    const content = fs.readFileSync(contextPath, 'utf-8');
    expect(content).toContain('task-1');
  });

  it('writes current_state.json after task completes', async () => {
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const statePath = path.join(nuggetDir, '.elisa', 'status', 'current_state.json');
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.tasks).toBeDefined();
    expect(state.tasks['task-1']).toBeDefined();
    expect(state.tasks['task-1'].status).toBe('done');
  });
});
