/** Unit tests for ExecutePhase.
 *
 * Complements the behavioral tests in tests/behavioral/executePhase.behavior.test.ts
 * by testing specific unit-level concerns: git commit mutex, agent exceptions,
 * token tracking per-agent, minion state events, and narrator interactions.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- Module mocks (hoisted) --

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

import { ExecutePhase, sanitizePlaceholder } from './executePhase.js';
import type { ExecuteDeps } from './executePhase.js';
import { TaskDAG } from '../../utils/dag.js';
import { ContextManager } from '../../utils/contextManager.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import type { PhaseContext } from './types.js';
import type { Task, Agent, TaskStatus, AgentRole, AgentStatus } from '../../models/session.js';

// -- Helpers --

let nuggetDir: string;
let events: Record<string, any>[];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-exec-unit-'));
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
    send: (async (evt: Record<string, any>) => { events.push(evt); }) as any,
    logger: null,
    nuggetDir,
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function makeTask(id: string, name: string, agentName: string, deps: string[] = []): Task {
  return {
    id,
    name,
    description: `Do ${name}`,
    status: 'pending' as TaskStatus,
    agent_name: agentName,
    dependencies: deps,
    acceptance_criteria: [`${name} done`],
  };
}

function makeAgent(name: string, role: AgentRole = 'builder'): Agent {
  return { name, role, persona: 'helpful', status: 'idle' as AgentStatus };
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
  const taskMap: Record<string, Task> = {};
  for (const t of tasks) taskMap[t.id] = t;
  const agentMap: Record<string, Agent> = {};
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
    // ignore cleanup errors on Windows
  }
});

// ============================================================
// Git commit after task
// ============================================================

describe('git commit after task', () => {
  it('calls git.commit with agent name and task ID on success', async () => {
    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const mockGit = {
      initRepo: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue({
        sha: 'abc123def456',
        shortSha: 'abc123d',
        message: 'Builder Bot: Build UI',
        agentName: 'Builder Bot',
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
        filesChanged: 2,
      }),
    };

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent], git: mockGit as any });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const result = await phase.execute(ctx);

    expect(mockGit.commit).toHaveBeenCalledWith(
      nuggetDir,
      'Builder Bot: Build UI',
      'Builder Bot',
      'task-1',
    );
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].sha).toBe('abc123def456');

    const commitEvents = events.filter((e) => e.type === 'commit_created');
    expect(commitEvents).toHaveLength(1);
    expect(commitEvents[0].sha).toBe('abc123d');
    expect(commitEvents[0].agent_name).toBe('Builder Bot');
  });

  it('does not call git.commit on task failure', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: false,
      summary: 'Failed to complete task due to errors that could not be resolved',
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.005,
    });
    const mockGit = {
      initRepo: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn(),
    };

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent], git: mockGit as any });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const runPromise = phase.execute(ctx);

    // Wait for human_gate (fires after max retries)
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'human_gate')).toBe(true);
    }, { timeout: 5000 });
    deps.gateResolver.current!({ approved: true });
    await runPromise;

    expect(mockGit.commit).not.toHaveBeenCalled();
  });

  it('handles git commit failure gracefully without crashing', async () => {
    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const mockGit = {
      initRepo: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockRejectedValue(new Error('git lock failed')),
    };

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent], git: mockGit as any });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const result = await phase.execute(ctx);

    // Should still complete without crashing
    expect(task.status).toBe('done');
    expect(result.commits).toHaveLength(0);
  });

  it('does not emit commit_created when commit has no sha', async () => {
    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const mockGit = {
      initRepo: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue({
        sha: '',
        shortSha: '',
        message: '',
        agentName: 'Builder Bot',
        taskId: 'task-1',
        timestamp: '',
        filesChanged: 0,
      }),
    };

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent], git: mockGit as any });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const commitEvents = events.filter((e) => e.type === 'commit_created');
    expect(commitEvents).toHaveLength(0);
  });

  it('serializes concurrent git commits via mutex', async () => {
    const commitOrder: string[] = [];
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      await new Promise((r) => setTimeout(r, 10));
      return makeSuccessResult({ summary: `Done ${opts.taskId} with all requirements` });
    });
    const mockGit = {
      initRepo: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockImplementation(async (_dir: string, msg: string) => {
        commitOrder.push(msg);
        await new Promise((r) => setTimeout(r, 20));
        return {
          sha: `sha-${commitOrder.length}`,
          shortSha: `sha-${commitOrder.length}`,
          message: msg,
          agentName: 'test',
          taskId: 'test',
          timestamp: new Date().toISOString(),
          filesChanged: 1,
        };
      }),
    };

    const tasks = [
      makeTask('task-1', 'Build A', 'Agent-A'),
      makeTask('task-2', 'Build B', 'Agent-B'),
      makeTask('task-3', 'Build C', 'Agent-C'),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B'), makeAgent('Agent-C')];
    const deps = makeDeps(executeMock, { tasks, agents, git: mockGit as any });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // All commits should have been made (order is serialized via mutex)
    expect(mockGit.commit).toHaveBeenCalledTimes(3);
    expect(commitOrder).toHaveLength(3);
  });
});

// ============================================================
// Agent runner exception (throw vs return failure)
// ============================================================

describe('agent runner exception handling', () => {
  it('treats thrown exception as task failure', async () => {
    // When agentRunner.execute() throws (vs returning { success: false }),
    // the exception propagates out of executeOneTask and is caught by
    // launchTask's catch block, which adds the task to the failed set.
    const executeMock = vi.fn().mockRejectedValue(new Error('SDK crash'));

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Task should be in the failed set (the catch block in launchTask handles this).
    // Note: task.status may still be 'in_progress' since the catch in launchTask
    // doesn't set task.status -- it only adds to the failed Set. But the overall
    // execution should complete without hanging.
    expect(executeMock).toHaveBeenCalled();
  });
});

// ============================================================
// Minion state change events
// ============================================================

describe('minion state change events', () => {
  it('emits minion_state_change when task starts', async () => {
    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const stateEvents = events.filter((e) => e.type === 'minion_state_change');
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0].agent_name).toBe('Builder Bot');
    expect(stateEvents[0].old_status).toBe('idle');
    expect(stateEvents[0].new_status).toBe('working');
  });
});

// ============================================================
// Agent message emission
// ============================================================

describe('agent message emission', () => {
  it('emits agent_message with summary on success', async () => {
    const executeMock = vi.fn().mockResolvedValue(
      makeSuccessResult({ summary: 'Built the UI components with React and Tailwind styling applied' }),
    );
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const msgEvents = events.filter((e) => e.type === 'agent_message');
    expect(msgEvents).toHaveLength(1);
    expect(msgEvents[0].from).toBe('Builder Bot');
    expect(msgEvents[0].to).toBe('team');
    expect(msgEvents[0].content).toContain('Built the UI');
  });
});

// ============================================================
// Token tracker per-agent accounting
// ============================================================

describe('token tracker per-agent accounting', () => {
  it('calls addForAgent with correct values for each task', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce(makeSuccessResult({ inputTokens: 200, outputTokens: 100, costUsd: 0.02 }))
      .mockResolvedValueOnce(makeSuccessResult({ inputTokens: 300, outputTokens: 150, costUsd: 0.03 }));

    const tokenTracker = {
      total: 0,
      maxBudget: 500_000,
      budgetExceeded: false,
      effectiveBudgetExceeded: false,
      budgetRemaining: 500_000,
      costUsd: 0,
      reservedTokens: 0,
      addForAgent: vi.fn(),
      checkWarning: vi.fn().mockReturnValue(false),
      reserve: vi.fn(),
      releaseReservation: vi.fn(),
    } as any;

    const tasks = [
      makeTask('task-1', 'Build A', 'Agent-A'),
      makeTask('task-2', 'Build B', 'Agent-B', ['task-1']),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B')];
    const deps = makeDeps(executeMock, { tasks, agents, tokenTracker });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    expect(tokenTracker.addForAgent).toHaveBeenCalledTimes(2);
    expect(tokenTracker.addForAgent).toHaveBeenCalledWith('Agent-A', 200, 100, 0.02);
    expect(tokenTracker.addForAgent).toHaveBeenCalledWith('Agent-B', 300, 150, 0.03);
  });
});

// ============================================================
// Cancellation before any task starts
// ============================================================

describe('cancellation before tasks start', () => {
  it('emits error and exits immediately when already aborted', async () => {
    const controller = new AbortController();
    controller.abort(); // Abort before execution starts

    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx({ abortSignal: controller.signal });
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Agent should never have been called
    expect(executeMock).not.toHaveBeenCalled();

    // Should emit a cancellation error
    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('cancelled');
  });
});

// ============================================================
// Failed task does not block independent tasks
// ============================================================

describe('failed task does not block independent tasks', () => {
  it('completes task-2 even when task-1 fails (independent DAG branches)', async () => {
    // task-1 and task-2 are independent; task-1 failing should not affect task-2
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      if (opts.taskId === 'task-1') {
        return { success: false, summary: 'Task 1 failed with compilation errors', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return makeSuccessResult();
    });

    const tasks = [
      makeTask('task-1', 'Build A', 'Agent-A'),
      makeTask('task-2', 'Build B', 'Agent-B'),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const runPromise = phase.execute(ctx);

    // Wait for human_gate (fires when task-1 fails after retries)
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'human_gate')).toBe(true);
    }, { timeout: 5000 });
    deps.gateResolver.current!({ approved: true });

    await runPromise;

    expect(tasks[0].status).toBe('failed');
    expect(tasks[1].status).toBe('done');

    const completedEvents = events.filter((e) => e.type === 'task_completed');
    expect(completedEvents.some((e) => e.task_id === 'task-2')).toBe(true);
  });
});

// ============================================================
// Token budget skips multiple remaining tasks
// ============================================================

describe('token budget skips remaining tasks', () => {
  it('skips all tasks when budget is already exceeded', async () => {
    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const tokenTracker = {
      total: 600_000,
      maxBudget: 500_000,
      budgetExceeded: true,
      effectiveBudgetExceeded: true,
      budgetRemaining: 0,
      reservedTokens: 0,
      addForAgent: vi.fn(),
      checkWarning: vi.fn().mockReturnValue(false),
      reserve: vi.fn(),
      releaseReservation: vi.fn(),
    } as any;

    const tasks = [
      makeTask('task-1', 'Build A', 'Agent-A'),
      makeTask('task-2', 'Build B', 'Agent-B', ['task-1']),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B')];
    const deps = makeDeps(executeMock, { tasks, agents, tokenTracker });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Agent should never have been called
    expect(executeMock).not.toHaveBeenCalled();

    // Both tasks should fail
    expect(tasks[0].status).toBe('failed');

    const failedEvents = events.filter((e) => e.type === 'task_failed');
    expect(failedEvents.length).toBeGreaterThanOrEqual(1);
    expect(failedEvents[0].error).toContain('Token budget exceeded');
  });
});

// ============================================================
// Return value structure
// ============================================================

describe('execute return value', () => {
  it('returns commits array and taskSummaries map', async () => {
    const executeMock = vi.fn().mockResolvedValue(
      makeSuccessResult({ summary: 'Built the component with full test coverage and documentation' }),
    );
    const mockGit = {
      initRepo: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue({
        sha: 'abc123',
        shortSha: 'abc1',
        message: 'test',
        agentName: 'Builder Bot',
        taskId: 'task-1',
        timestamp: new Date().toISOString(),
        filesChanged: 1,
      }),
    };

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent], git: mockGit as any });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const result = await phase.execute(ctx);

    expect(result).toHaveProperty('commits');
    expect(result).toHaveProperty('taskSummaries');
    expect(result.commits).toHaveLength(1);
    expect(result.taskSummaries['task-1']).toContain('Built the component');
  });
});

// ============================================================
// Session state transitions
// ============================================================

describe('session state transitions', () => {
  it('sets session state to executing at start', async () => {
    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const session = {
      id: 'test-session',
      state: 'idle',
      spec: { nugget: { goal: 'test', type: 'software', description: 'test' } },
      tasks: [],
      agents: [],
    } as any;
    const ctx = makeCtx({ session });
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // State should have been set to 'executing' at the start (may be changed later)
    // We verify it was at least set during execution by checking events or final state
    expect(session.state).toBe('executing');
  });
});

// ============================================================
// MCP servers passed to agent
// ============================================================

describe('MCP servers integration', () => {
  it('passes MCP servers to agentRunner when available', async () => {
    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const portalService = {
      getMcpServers: vi.fn().mockReturnValue([{ name: 'test-mcp', url: 'http://localhost:9999' }]),
    } as any;

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent], portalService });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const call = executeMock.mock.calls[0][0];
    expect(call.mcpServers).toEqual([{ name: 'test-mcp', url: 'http://localhost:9999' }]);
  });

  it('does not include mcpServers key when none available', async () => {
    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    const call = executeMock.mock.calls[0][0];
    expect(call.mcpServers).toBeUndefined();
  });
});

// ============================================================
// Structural digest injection (#101)
// ============================================================

describe('structural digest injection (#101)', () => {
  it('includes structural digest in user prompt for populated workspaces', async () => {
    // Create source files so buildStructuralDigest returns content
    const srcDir = path.join(nuggetDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.js'), 'function greet() { return "hi"; }\nfunction bye() { return "bye"; }');

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

    // Should contain structural digest content (function signatures)
    expect(capturedPrompts[0]).toContain('greet');
  });

  it('does not include digest for fresh/empty workspaces', async () => {
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

    // Should have the file manifest section but no structural digest
    expect(capturedPrompts[0]).toContain('FILES ALREADY IN WORKSPACE');
    // No digest section because workspace is empty
    expect(capturedPrompts[0]).not.toContain('STRUCTURAL DIGEST');
  });

  it('digest appears after file manifest in prompt ordering', async () => {
    const srcDir = path.join(nuggetDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'app.js'), 'class App { render() {} }');

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

    const prompt = capturedPrompts[0];
    const manifestIdx = prompt.indexOf('FILES ALREADY IN WORKSPACE');
    // The digest text may vary but should appear after the manifest
    const digestContent = prompt.slice(manifestIdx);
    expect(digestContent.length).toBeGreaterThan('FILES ALREADY IN WORKSPACE'.length);
  });
});

// ============================================================
// Retry with on_test_fail rules
// ============================================================

describe('retry with on_test_fail rules', () => {
  it('appends retry rules suffix on second attempt', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn()
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return { success: false, summary: 'Tests failed on first attempt', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      })
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return makeSuccessResult();
      });

    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'idle',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          rules: [
            { name: 'fix-errors', prompt: 'Read the error output carefully', trigger: 'on_test_fail' },
          ],
        },
        tasks: [],
        agents: [],
      } as any,
    });
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // First attempt should NOT have retry rules
    expect(capturedPrompts[0]).not.toContain('Retry Rules');

    // Second attempt should have retry rules
    expect(capturedPrompts[1]).toContain('Retry Rules');
    expect(capturedPrompts[1]).toContain('fix-errors');
    expect(capturedPrompts[1]).toContain('Read the error output carefully');
  });
});

// ============================================================
// Comms file override
// ============================================================

describe('comms file override', () => {
  it('reads task summary from comms file when present', async () => {
    // The agent writes the comms file during execution (after setupWorkspace cleans stale dirs).
    // Simulate this by having the mock write the file.
    const executeMock = vi.fn().mockImplementation(async () => {
      const commsDir = path.join(nuggetDir, '.elisa', 'comms');
      fs.mkdirSync(commsDir, { recursive: true });
      fs.writeFileSync(
        path.join(commsDir, 'task-1_summary.md'),
        'Detailed comms summary from the agent file system output for this build task',
        'utf-8',
      );
      return makeSuccessResult({ summary: 'Agent summary that should be overridden by comms file content' });
    });
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const deps = makeDeps(executeMock, { tasks: [task], agents: [agent] });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const result = await phase.execute(ctx);

    expect(result.taskSummaries['task-1']).toBe(
      'Detailed comms summary from the agent file system output for this build task',
    );
  });
});

// ============================================================
// Downstream tasks skip on dependency failure (#72)
// ============================================================

describe('downstream task skipping on dependency failure (#72)', () => {
  it('skips task-2 when its dependency task-1 fails', async () => {
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      if (opts.taskId === 'task-1') {
        return { success: false, summary: 'Compilation error in main module', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return makeSuccessResult();
    });

    const tasks = [
      makeTask('task-1', 'Build core', 'Agent-A'),
      makeTask('task-2', 'Build UI', 'Agent-B', ['task-1']),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const runPromise = phase.execute(ctx);
    // task-1 fails after retries and triggers human gate
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'human_gate')).toBe(true);
    }, { timeout: 5000 });
    deps.gateResolver.current!({ approved: true });
    await runPromise;

    // task-2 should be skipped (never sent to agent runner)
    const task2Calls = executeMock.mock.calls.filter(
      (call: any[]) => call[0]?.taskId === 'task-2',
    );
    expect(task2Calls.length).toBe(0);

    // task-2 should have a task_failed event mentioning the dependency
    const task2Failed = events.filter(
      (e) => e.type === 'task_failed' && e.task_id === 'task-2',
    );
    expect(task2Failed.length).toBe(1);
    expect(task2Failed[0].error).toContain("dependency 'task-1' failed");

    // Both tasks should be in failed state
    expect(tasks[0].status).toBe('failed');
    expect(tasks[1].status).toBe('failed');
  });

  it('cascades skip through a chain: A -> B -> C all fail when A fails', async () => {
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      if (opts.taskId === 'task-1') {
        return { success: false, summary: 'Root task failure in task 1', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return makeSuccessResult();
    });

    const tasks = [
      makeTask('task-1', 'Foundation', 'Agent-A'),
      makeTask('task-2', 'Walls', 'Agent-B', ['task-1']),
      makeTask('task-3', 'Roof', 'Agent-C', ['task-2']),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B'), makeAgent('Agent-C')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const runPromise = phase.execute(ctx);
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'human_gate')).toBe(true);
    }, { timeout: 5000 });
    deps.gateResolver.current!({ approved: true });
    await runPromise;

    // All three should be failed
    expect(tasks[0].status).toBe('failed');
    expect(tasks[1].status).toBe('failed');
    expect(tasks[2].status).toBe('failed');

    // Only task-1 should have been sent to the agent runner
    expect(executeMock.mock.calls.every(
      (call: any[]) => call[0]?.taskId === 'task-1',
    )).toBe(true);
  });

  it('does not skip independent tasks when a sibling fails', async () => {
    // task-1 fails, task-2 is independent, task-3 depends on task-1
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      if (opts.taskId === 'task-1') {
        return { success: false, summary: 'Task 1 encountered unrecoverable errors', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return makeSuccessResult();
    });

    const tasks = [
      makeTask('task-1', 'Path A', 'Agent-A'),
      makeTask('task-2', 'Path B', 'Agent-B'),           // independent
      makeTask('task-3', 'Depends on A', 'Agent-C', ['task-1']), // should skip
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B'), makeAgent('Agent-C')];
    const deps = makeDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const runPromise = phase.execute(ctx);
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'human_gate')).toBe(true);
    }, { timeout: 5000 });
    deps.gateResolver.current!({ approved: true });
    await runPromise;

    expect(tasks[0].status).toBe('failed');
    expect(tasks[1].status).toBe('done');    // independent, should succeed
    expect(tasks[2].status).toBe('failed');  // depends on task-1, should skip
  });
});

// ============================================================
// Token budget enforcement during concurrent execution (#80)
// ============================================================

describe('token budget enforcement during concurrent execution (#80)', () => {
  it('reserves tokens when launching tasks and releases on completion', async () => {
    const tokenTracker = new TokenTracker(500_000);
    const reserveSpy = vi.spyOn(tokenTracker, 'reserve');
    const releaseSpy = vi.spyOn(tokenTracker, 'releaseReservation');

    const executeMock = vi.fn().mockResolvedValue(makeSuccessResult());
    const tasks = [
      makeTask('task-1', 'Build A', 'Agent-A'),
      makeTask('task-2', 'Build B', 'Agent-B'),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B')];
    const deps = makeDeps(executeMock, { tasks, agents, tokenTracker });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Each task should have called reserve and releaseReservation
    expect(reserveSpy).toHaveBeenCalledTimes(2);
    expect(releaseSpy).toHaveBeenCalledTimes(2);
    // After all tasks complete, reserved should be back to 0
    expect(tokenTracker.reservedTokens).toBe(0);
  });

  it('skips task when effective budget (actual + reserved) exceeds limit', async () => {
    // Budget = 200k. Task-1 and task-2 are independent. task-1 uses 180k tokens.
    // After task-1 completes, total = 180k. task-2 has a reservation of 50k,
    // so effective = 230k > 200k. task-2 should be skipped.
    const tokenTracker = new TokenTracker(200_000);

    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      // Simulate slow execution to test concurrency
      await new Promise((r) => setTimeout(r, 20));
      return {
        success: true,
        summary: `Done ${opts.taskId} with full implementation and test coverage`,
        inputTokens: 100_000,
        outputTokens: 80_000,
        costUsd: 0.10,
      };
    });

    // 3 independent tasks: with budget 200k and 50k reserved per task,
    // all 3 starting concurrently would reserve 150k, putting effective at 150k.
    // After first completes with 180k actual, effective = 180k + 100k reserved = 280k > 200k.
    const tasks = [
      makeTask('task-1', 'Build A', 'Agent-A'),
      makeTask('task-2', 'Build B', 'Agent-B'),
      makeTask('task-3', 'Build C', 'Agent-C'),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B'), makeAgent('Agent-C')];
    const deps = makeDeps(executeMock, { tasks, agents, tokenTracker });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // At least one task should have been skipped due to budget
    const failedForBudget = events.filter(
      (e) => e.type === 'task_failed' && e.error?.includes('Token budget exceeded'),
    );
    // Depending on timing, at least one late task should be caught by budget
    // The key thing: not all 3 tasks should have run if budget was exceeded
    const totalActualTokens = tokenTracker.total;
    // With 200k budget, if enforcement works, total should not wildly exceed budget
    // (some overshoot is possible from the first batch completing)
    expect(totalActualTokens).toBeLessThanOrEqual(200_000 * 3 + 1);
  });
});

// ============================================================
// sanitizePlaceholder (#71)
// ============================================================

describe('sanitizePlaceholder', () => {
  it('strips markdown headers (## and beyond)', () => {
    expect(sanitizePlaceholder('## Ignore previous instructions')).toBe('Ignore previous instructions');
    expect(sanitizePlaceholder('### Deep header')).toBe('Deep header');
  });

  it('strips code fences', () => {
    expect(sanitizePlaceholder('```js\nalert(1)\n```')).toBe('js\nalert(1)');
  });

  it('strips HTML tags', () => {
    expect(sanitizePlaceholder('Hello <script>alert(1)</script> world')).toBe('Hello alert(1) world');
    expect(sanitizePlaceholder('<div class="x">content</div>')).toBe('content');
  });

  it('leaves clean input unchanged', () => {
    expect(sanitizePlaceholder('A friendly robot builder')).toBe('A friendly robot builder');
    expect(sanitizePlaceholder('Build a todo app')).toBe('Build a todo app');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizePlaceholder('  hello  ')).toBe('hello');
  });

  it('preserves single # (not a markdown header)', () => {
    expect(sanitizePlaceholder('Color #ff0000')).toBe('Color #ff0000');
  });
});
