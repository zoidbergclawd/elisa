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
import { TokenTracker } from '../../utils/tokenTracker.js';
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
// Failed task DAG propagation
// ============================================================

describe('failed task DAG propagation', () => {
  it('allows downstream tasks to run after a dependency fails', async () => {
    // When task-1 fails, task-2 (depends on task-1) should still get a chance
    // to run because the DAG treats failed tasks as "settled"
    const executeMock = vi.fn()
      .mockImplementation(async (opts: any) => {
        if (opts.taskId === 'task-1') {
          return { success: false, summary: 'Failed task 1', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
        }
        return { success: true, summary: 'Task completed successfully with verified output', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
      });

    const tasks = [
      makeTask('task-1', 'First', 'Agent-A'),
      makeTask('task-2', 'Second', 'Agent-B', ['task-1']),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    // task-1 will fail and trigger human gate. We need to resolve it.
    const runPromise = phase.execute(ctx);

    // Wait for human_gate to fire (after task-1 fails 3 times)
    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === 'human_gate')).toBe(true);
      },
      { timeout: 5000 },
    );
    deps.gateResolver.current!({ approved: true });

    const result = await runPromise;

    // task-1 should be failed, task-2 should still have executed
    expect(tasks[0].status).toBe('failed');
    // task-2 gets to run because failed deps are treated as settled
    const task2Started = events.filter((e) => e.type === 'task_started' && e.task_id === 'task-2');
    expect(task2Started.length).toBe(1);
  });

  it('terminates when all remaining tasks are blocked and no in-flight', async () => {
    // If a task has a dependency that is neither completed nor failed,
    // and there's nothing in flight, the loop should detect the deadlock and break
    const executeMock = makeExecuteMock();
    const dag = new TaskDAG();
    dag.addTask('task-1', ['task-missing']); // depends on nonexistent task
    const tasks = [makeTask('task-1', 'Blocked', 'Agent-A')];
    const agents = [makeAgent('Agent-A')];
    const taskMap: Record<string, Record<string, any>> = { 'task-1': tasks[0] };
    const agentMap: Record<string, Record<string, any>> = { 'Agent-A': agents[0] };
    const deps = makeDeps(executeMock, { tasks, agents, dag, taskMap, agentMap });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Should emit an error about blocked tasks
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('blocked');
  });
});

// ============================================================
// Deploy task skip
// ============================================================

describe('deploy task skip', () => {
  it('skips deploy task when no deployment target is configured', async () => {
    const executeMock = makeExecuteMock();
    const tasks = [
      makeTask('task-1', 'Deploy to production', 'Agent-A'),
    ];
    // Override the description to trigger deploy detection
    tasks[0].description = 'Deploy to the web for production use';
    const agents = [makeAgent('Agent-A')];
    const deps = makeDeps(executeMock, { tasks, agents });
    // Session spec has no deployment target and no portals
    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'idle',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          deployment: { target: 'preview' },
        },
        tasks: [],
        agents: [],
      } as any,
    });
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Task should be done (skipped)
    expect(tasks[0].status).toBe('done');

    // Agent should NOT have been called (the task was skipped)
    expect(executeMock).not.toHaveBeenCalled();

    // Should emit agent_output about skipping
    const outputs = events.filter(
      (e) => e.type === 'agent_output' && e.content.includes('No deployment target'),
    );
    expect(outputs.length).toBe(1);
  });

  it('does not skip deploy task when esp32 target is configured', async () => {
    const executeMock = makeExecuteMock();
    const tasks = [
      makeTask('task-1', 'Deploy code', 'Agent-A'),
    ];
    tasks[0].description = 'Deploy to the web';
    const agents = [makeAgent('Agent-A')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'idle',
        spec: {
          nugget: { goal: 'test', type: 'hardware', description: 'test' },
          deployment: { target: 'esp32' },
        },
        tasks: [],
        agents: [],
      } as any,
    });
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Agent should have been called because esp32 target is configured
    expect(executeMock).toHaveBeenCalled();
  });
});

// ============================================================
// Token budget enforcement
// ============================================================

describe('token budget enforcement', () => {
  it('fails task and emits error when token budget is exceeded', async () => {
    const executeMock = makeExecuteMock();
    const tasks = [makeTask('task-1', 'Build UI', 'Builder Bot')];
    const agents = [makeAgent('Builder Bot')];
    // Mock a token tracker that reports budget exceeded
    const tokenTracker = {
      total: 1000,
      maxBudget: 500,
      budgetExceeded: true,
      budgetRemaining: 0,
      addForAgent: vi.fn(),
      checkWarning: vi.fn().mockReturnValue(false),
    } as any;
    const deps = makeDeps(executeMock, {
      tasks,
      agents,
      tokenTracker,
    });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Task should be failed
    expect(tasks[0].status).toBe('failed');

    // Agent should NOT have been called
    expect(executeMock).not.toHaveBeenCalled();

    // Should emit task_failed event
    const failedEvents = events.filter((e) => e.type === 'task_failed');
    expect(failedEvents.length).toBe(1);
    expect(failedEvents[0].error).toContain('Token budget exceeded');
  });

  it('includes cost_usd in token_usage event', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      summary: 'Task completed with all requirements met and verified by automated checks',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.025,
    });
    const tasks = [makeTask('task-1', 'Build UI', 'Builder Bot')];
    const agents = [makeAgent('Builder Bot')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const tokenEvents = events.filter((e) => e.type === 'token_usage');
    expect(tokenEvents.length).toBe(1);
    expect(tokenEvents[0].cost_usd).toBe(0.025);
  });

  it('emits budget_warning when threshold crossed', async () => {
    // Use a tracker with low budget so 150 tokens (100+50) exceeds 80% of 180
    const tokenTracker = new TokenTracker(180);
    const executeMock = makeExecuteMock();
    const tasks = [makeTask('task-1', 'Build UI', 'Builder Bot')];
    const agents = [makeAgent('Builder Bot')];
    const deps = makeDeps(executeMock, { tasks, agents, tokenTracker });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // After addForAgent(100, 50) the tracker total is 150, which is >= 80% of 180 (=144)
    const warningEvents = events.filter((e) => e.type === 'budget_warning');
    expect(warningEvents.length).toBe(1);
    expect(warningEvents[0].total_tokens).toBe(150);
    expect(warningEvents[0].max_budget).toBe(180);
  });
});

// ============================================================
// Human gate (midpoint)
// ============================================================

describe('human gate at midpoint', () => {
  it('fires gate at midpoint when human_gates configured', async () => {
    const executeMock = makeExecuteMock();
    const tasks = [
      makeTask('task-1', 'Step 1', 'Agent-A'),
      makeTask('task-2', 'Step 2', 'Agent-A', ['task-1']),
      makeTask('task-3', 'Step 3', 'Agent-A', ['task-2']),
      makeTask('task-4', 'Step 4', 'Agent-A', ['task-3']),
    ];
    const agents = [makeAgent('Agent-A')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'idle',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          workflow: { human_gates: ['midpoint'] },
        },
        tasks: [],
        agents: [],
      } as any,
    });
    const phase = new ExecutePhase(deps);

    const runPromise = phase.execute(ctx);

    // Wait for human_gate to fire
    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === 'human_gate')).toBe(true);
      },
      { timeout: 5000 },
    );

    // Approve gate
    deps.gateResolver.current!({ approved: true });

    await runPromise;

    const gateEvents = events.filter((e) => e.type === 'human_gate');
    expect(gateEvents.length).toBe(1);

    // All tasks should complete
    const completed = events.filter((e) => e.type === 'task_completed');
    expect(completed.length).toBe(4);
  });

  it('adds revision task when gate is rejected', async () => {
    const executeMock = makeExecuteMock();
    const tasks = [
      makeTask('task-1', 'Step 1', 'Agent-A'),
      makeTask('task-2', 'Step 2', 'Agent-A', ['task-1']),
      makeTask('task-3', 'Step 3', 'Agent-A', ['task-2']),
      makeTask('task-4', 'Step 4', 'Agent-A', ['task-3']),
    ];
    const agents = [makeAgent('Agent-A')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'idle',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          workflow: { human_gates: ['midpoint'] },
        },
        tasks: [],
        agents: [],
      } as any,
    });
    const phase = new ExecutePhase(deps);

    const runPromise = phase.execute(ctx);

    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === 'human_gate')).toBe(true);
      },
      { timeout: 5000 },
    );

    // Reject gate with feedback
    deps.gateResolver.current!({ approved: false, feedback: 'Make it better' });

    await runPromise;

    // A revision task should have been added
    const revisionTask = deps.tasks.find((t) => t.id.includes('revision'));
    expect(revisionTask).toBeDefined();
    expect(revisionTask!.description).toContain('Make it better');
  });
});

// ============================================================
// Abort signal handling
// ============================================================

describe('abort signal handling', () => {
  it('breaks execution loop when abort signal is fired', async () => {
    const controller = new AbortController();
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      // Abort after the first task starts
      if (opts.taskId === 'task-1') {
        controller.abort();
      }
      return { success: true, summary: 'Done with thorough implementation work', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const tasks = [
      makeTask('task-1', 'First', 'Agent-A'),
      makeTask('task-2', 'Second', 'Agent-A', ['task-1']),
    ];
    const agents = [makeAgent('Agent-A')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx({ abortSignal: controller.signal });
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Error about cancellation should be emitted
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.some((e) => e.message.includes('cancelled'))).toBe(true);
  });
});

// ============================================================
// System prompt placeholder resolution
// ============================================================

describe('system prompt placeholder resolution', () => {
  it('replaces all placeholders in system prompt', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      capturedPrompts.push(opts.systemPrompt);
      return { success: true, summary: 'Completed task with all requirements satisfied and tested', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    const tasks = [makeTask('task-1', 'Build UI', 'Builder Bot')];
    const agent = makeAgent('Builder Bot');
    agent.persona = 'A friendly robot';
    const agents = [agent];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    expect(capturedPrompts.length).toBe(1);
    const prompt = capturedPrompts[0];
    expect(prompt).toContain('Builder Bot');
    expect(prompt).toContain('A friendly robot');
    expect(prompt).toContain('task-1');
    expect(prompt).toContain('test goal');
    expect(prompt).toContain('software');
    // Should NOT contain unresolved placeholders
    expect(prompt).not.toContain('{agent_name}');
    expect(prompt).not.toContain('{persona}');
    expect(prompt).not.toContain('{task_id}');
  });
});

// ============================================================
// Concurrent task limits
// ============================================================

describe('concurrent task limits', () => {
  it('does not exceed MAX_CONCURRENT (3) tasks in flight', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const executeMock = vi.fn().mockImplementation(async () => {
      currentConcurrent++;
      if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
      await new Promise((r) => setTimeout(r, 30));
      currentConcurrent--;
      return { success: true, summary: 'Completed the task fully with verification and testing', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    // 5 independent tasks
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask(`task-${i + 1}`, `Task ${i + 1}`, `Agent-${i + 1}`),
    );
    const agents = Array.from({ length: 5 }, (_, i) =>
      makeAgent(`Agent-${i + 1}`),
    );
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThanOrEqual(2); // Should actually be parallel
  });
});

// ============================================================
// Streaming-parallel scheduling (Issue #18 regression)
// ============================================================

describe('streaming-parallel scheduling (issue #18)', () => {
  it('does not schedule tasks when all slots are occupied (bug #1: Math.max fix)', async () => {
    // With the old Math.max(1, batchSize), even when inFlight.size >= MAX_CONCURRENT,
    // at least 1 extra task would be scheduled, exceeding the concurrency limit.
    let peakConcurrent = 0;
    let currentConcurrent = 0;

    const executeMock = vi.fn().mockImplementation(async () => {
      currentConcurrent++;
      if (currentConcurrent > peakConcurrent) peakConcurrent = currentConcurrent;
      // Use a longer delay to ensure overlap is measurable
      await new Promise((r) => setTimeout(r, 50));
      currentConcurrent--;
      return { success: true, summary: 'Completed the full task with implementation and verification', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    // 6 independent tasks -- more than 2x MAX_CONCURRENT to stress the scheduler
    const tasks = Array.from({ length: 6 }, (_, i) =>
      makeTask(`task-${i + 1}`, `Task ${i + 1}`, `Agent-${i + 1}`),
    );
    const agents = Array.from({ length: 6 }, (_, i) =>
      makeAgent(`Agent-${i + 1}`),
    );
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Must never exceed MAX_CONCURRENT (3)
    expect(peakConcurrent).toBeLessThanOrEqual(3);
    // All tasks should have completed
    expect(events.filter((e) => e.type === 'task_completed').length).toBe(6);
  });

  it('fills freed slot immediately when a task completes (bug #2: streaming vs batch)', async () => {
    // With the old Promise.all batch approach, tasks 4+ would not start until
    // the entire first batch of 3 finished. With streaming-parallel, task-4
    // should start as soon as the first of tasks 1-3 completes.
    const taskTimeline: { taskId: string; event: string; time: number }[] = [];
    const start = Date.now();

    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      taskTimeline.push({ taskId: opts.taskId, event: 'start', time: Date.now() - start });
      // task-1 finishes quickly; tasks 2-3 take longer
      const delay = opts.taskId === 'task-1' ? 20 : 80;
      await new Promise((r) => setTimeout(r, delay));
      taskTimeline.push({ taskId: opts.taskId, event: 'end', time: Date.now() - start });
      return { success: true, summary: 'Full implementation with tests verified and passing correctly', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
    });

    // 4 independent tasks: 3 fill the pool, task-4 should fill the slot freed by task-1
    const tasks = Array.from({ length: 4 }, (_, i) =>
      makeTask(`task-${i + 1}`, `Task ${i + 1}`, `Agent-${i + 1}`),
    );
    const agents = Array.from({ length: 4 }, (_, i) =>
      makeAgent(`Agent-${i + 1}`),
    );
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // task-4 should start BEFORE tasks 2 and 3 finish (streaming behavior)
    const task4Start = taskTimeline.find((e) => e.taskId === 'task-4' && e.event === 'start');
    const task2End = taskTimeline.find((e) => e.taskId === 'task-2' && e.event === 'end');
    const task3End = taskTimeline.find((e) => e.taskId === 'task-3' && e.event === 'end');

    expect(task4Start).toBeDefined();
    expect(task2End).toBeDefined();
    expect(task3End).toBeDefined();

    // With batch-parallel (old behavior), task-4 would start AFTER both task-2 and task-3 end.
    // With streaming-parallel, task-4 starts before at least one of the slow tasks finishes.
    const latestSlowEnd = Math.max(task2End!.time, task3End!.time);
    expect(task4Start!.time).toBeLessThan(latestSlowEnd);
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
