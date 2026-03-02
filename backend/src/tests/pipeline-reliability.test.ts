/** Regression tests for backend pipeline reliability fixes.
 *
 * Covers:
 * - P1 #6: Token budget skip does NOT cascade-fail downstream DAG tasks
 * - P1 #7: Retry prompts include failure summary, workspace diff, and test output
 * - P1 #8: detectTruncations reports fields exceeding Zod caps
 * - P3 #21: task_failed events carry actual retry count (verified via handleFailure)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- Module mocks (hoisted) --

vi.mock('../prompts/builderAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}. Turns: {max_turns}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Build the thing'),
}));

vi.mock('../prompts/testerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a tester. Turns: {max_turns}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Test the thing'),
}));

vi.mock('../prompts/reviewerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a reviewer. Turns: {max_turns}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Review the thing'),
}));

import { ExecutePhase } from '../services/phases/executePhase.js';
import type { ExecuteDeps } from '../services/phases/executePhase.js';
import { TaskExecutor } from '../services/phases/taskExecutor.js';
import type { TaskExecutorDeps, TaskExecutionOptions } from '../services/phases/taskExecutor.js';
import { PromptBuilder } from '../services/phases/promptBuilder.js';
import { ContextManager } from '../utils/contextManager.js';
import { TokenTracker } from '../utils/tokenTracker.js';
import { TaskDAG } from '../utils/dag.js';
import { detectTruncations } from '../utils/specValidator.js';
import type { PhaseContext } from '../services/phases/types.js';
import type { BuildSession, Task, Agent, TaskStatus, AgentRole, AgentStatus, CommitInfo } from '../models/session.js';

// -- Helpers --

let nuggetDir: string;
let events: Record<string, any>[];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-pipeline-rel-'));
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

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: {
      id: 'test-session',
      state: 'idle',
      spec: { nugget: { goal: 'test goal', type: 'software', description: 'test desc' } },
      tasks: [],
      agents: [],
    } as unknown as BuildSession,
    send: (async (evt: Record<string, any>) => { events.push(evt); }) as any,
    logger: null,
    nuggetDir,
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function makeExecuteMock() {
  return vi.fn().mockResolvedValue({
    success: true,
    summary: 'Task completed successfully with all requirements met and verified by automated checks',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.01,
  });
}

function makeExecuteDeps(
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

function makeTaskExecutorDeps(
  executeMock: ReturnType<typeof vi.fn>,
  overrides: Partial<TaskExecutorDeps> = {},
): TaskExecutorDeps {
  return {
    agentRunner: { execute: executeMock } as any,
    git: null,
    teachingEngine: { getMoment: vi.fn().mockResolvedValue(null) } as any,
    tokenTracker: overrides.tokenTracker ?? new TokenTracker(),
    context: new ContextManager(),
    promptBuilder: new PromptBuilder(),
    portalService: { getMcpServers: vi.fn().mockReturnValue([]) } as any,
    ...overrides,
  };
}

function makeTaskOptions(overrides: Partial<TaskExecutionOptions> = {}): TaskExecutionOptions {
  const tasks = overrides.tasks ?? [];
  const taskMap: Record<string, Task> = overrides.taskMap ?? {};
  for (const t of tasks) taskMap[t.id] = t;
  const dag = overrides.dag ?? new TaskDAG();
  for (const t of tasks) {
    try { dag.addTask(t.id, t.dependencies ?? []); } catch { /* already added */ }
  }

  return {
    taskMap,
    taskSummaries: overrides.taskSummaries ?? {},
    tasks,
    agents: overrides.agents ?? [],
    nuggetDir,
    gitMutex: overrides.gitMutex ?? (async (fn) => { await fn(); }),
    questionResolvers: overrides.questionResolvers ?? new Map(),
    gateResolver: overrides.gateResolver ?? { current: null },
    dag,
    completed: overrides.completed ?? new Set<string>(),
    commits: overrides.commits ?? [],
  };
}

function setupWorkspaceDirs(): void {
  fs.mkdirSync(path.join(nuggetDir, '.elisa', 'comms'), { recursive: true });
  fs.mkdirSync(path.join(nuggetDir, '.elisa', 'context'), { recursive: true });
  fs.mkdirSync(path.join(nuggetDir, '.elisa', 'status'), { recursive: true });
  fs.mkdirSync(path.join(nuggetDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(nuggetDir, 'tests'), { recursive: true });
}

// -- Setup / Teardown --

beforeEach(() => {
  vi.clearAllMocks();
  nuggetDir = makeTempDir();
  events = [];
  setupWorkspaceDirs();
});

afterEach(() => {
  try {
    fs.rmSync(nuggetDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ============================================================
// P1 #6: Token budget skip does NOT cascade-fail downstream tasks
// ============================================================

describe('P1 #6: budget-skipped tasks do not cascade-fail downstream', () => {
  it('uses "skipped" status for budget-exceeded tasks, not "failed"', async () => {
    const executeMock = makeExecuteMock();
    const tokenTracker = {
      total: 600_000,
      maxBudget: 500_000,
      budgetExceeded: true,
      effectiveBudgetExceeded: true,
      effectiveTotal: 600_000,
      budgetRemaining: 0,
      reservedTokens: 0,
      costUsd: 0,
      addForAgent: vi.fn(),
      checkWarning: vi.fn().mockReturnValue(false),
      reserve: vi.fn(),
      releaseReservation: vi.fn(),
    } as any;

    const tasks = [makeTask('task-1', 'Build A', 'Agent-A')];
    const agents = [makeAgent('Agent-A')];
    const deps = makeExecuteDeps(executeMock, { tasks, agents, tokenTracker });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // Task should have 'skipped' status, NOT 'failed'
    expect(tasks[0].status).toBe('skipped');
  });

  it('downstream task of budget-skipped task is NOT cascade-failed', async () => {
    // Verify the core invariant: when task-1 is skipped due to budget,
    // task-2 (which depends on task-1) should NOT get status: 'failed'.
    // Instead it can proceed or also be budget-skipped, but never
    // "Skipped: dependency failed" cascade.
    const executeMock = makeExecuteMock();
    const tokenTracker = {
      total: 600_000,
      maxBudget: 500_000,
      budgetExceeded: true,
      effectiveBudgetExceeded: true,
      effectiveTotal: 600_000,
      budgetRemaining: 0,
      reservedTokens: 0,
      costUsd: 0,
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
    const deps = makeExecuteDeps(executeMock, { tasks, agents, tokenTracker });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    await phase.execute(ctx);

    // task-1 should be 'skipped' (budget exceeded)
    expect(tasks[0].status).toBe('skipped');
    // task-2 should also be 'skipped' (budget) -- NOT 'failed' from cascade
    expect(tasks[1].status).toBe('skipped');

    // Critically: task-2's failure message should NOT mention dependency failure
    const task2Failed = events.filter(
      (e) => e.type === 'task_failed' && e.task_id === 'task-2',
    );
    expect(task2Failed).toHaveLength(1);
    expect(task2Failed[0].error).toContain('Token budget exceeded');
    expect(task2Failed[0].error).not.toContain('dependency');
  });

  it('dependency-failed tasks still get "failed" status and cascade', async () => {
    const executeMock = vi.fn().mockImplementation(async (opts: any) => {
      if (opts.taskId === 'task-1') {
        return { success: false, summary: 'Real failure in task 1', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      }
      return {
        success: true,
        summary: 'Task completed with all requirements met and verified automatically',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      };
    });

    const tasks = [
      makeTask('task-1', 'Build A', 'Agent-A'),
      makeTask('task-2', 'Build B', 'Agent-B', ['task-1']),
    ];
    const agents = [makeAgent('Agent-A'), makeAgent('Agent-B')];
    const deps = makeExecuteDeps(executeMock, { tasks, agents });
    const ctx = makeCtx();
    const phase = new ExecutePhase(deps);

    const runPromise = phase.execute(ctx);

    // task-1 will fail 3 times and trigger human gate
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'human_gate')).toBe(true);
    }, { timeout: 5000 });
    deps.gateResolver.current!({ approved: true });
    await runPromise;

    // task-1 should be 'failed' (real failure)
    expect(tasks[0].status).toBe('failed');
    // task-2 should also be 'failed' (cascade from dependency failure)
    expect(tasks[1].status).toBe('failed');
  });
});

// ============================================================
// P1 #7: Retry prompts include failure context
// ============================================================

describe('P1 #7: retry prompts include failure-specific context', () => {
  it('includes previous failure summary in retry prompt', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn()
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return {
          success: false,
          summary: 'TypeError: Cannot read property "x" of undefined at line 42',
          inputTokens: 50,
          outputTokens: 20,
          costUsd: 0.005,
        };
      })
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return {
          success: true,
          summary: 'Fixed the TypeError and all tests pass now with verified output',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.01,
        };
      });

    const deps = makeTaskExecutorDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeTaskOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    // First prompt should NOT have previous failure
    expect(capturedPrompts[0]).not.toContain('Previous Failure');

    // Second prompt (retry) should include the failure summary
    expect(capturedPrompts[1]).toContain('### Previous Failure');
    expect(capturedPrompts[1]).toContain('TypeError: Cannot read property "x" of undefined');
  });

  it('includes workspace diff from git in retry prompt', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn()
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return { success: false, summary: 'Build failed', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      })
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return {
          success: true,
          summary: 'Fixed the build and all tests pass now correctly verified',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.01,
        };
      });

    const mockGit = {
      getWorkspaceDiff: vi.fn().mockResolvedValue('diff --git a/src/index.ts\n+const x = 42;'),
      commit: vi.fn(),
    };

    const deps = makeTaskExecutorDeps(executeMock, { git: mockGit as any });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeTaskOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    // Retry prompt should include workspace diff
    expect(capturedPrompts[1]).toContain('### Workspace Changes Since Last Commit');
    expect(capturedPrompts[1]).toContain('const x = 42');
  });

  it('includes test output file content in retry prompt', async () => {
    // Write a mock test output file
    const testOutputPath = path.join(nuggetDir, '.elisa', 'status', 'test_output.txt');
    fs.writeFileSync(testOutputPath, 'FAIL src/app.test.ts\n  Expected: 42\n  Received: undefined', 'utf-8');

    const capturedPrompts: string[] = [];
    const executeMock = vi.fn()
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return { success: false, summary: 'Tests failing', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      })
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return {
          success: true,
          summary: 'Fixed tests and all pass now with full verification complete',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.01,
        };
      });

    const deps = makeTaskExecutorDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeTaskOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    // Retry prompt should include test output
    expect(capturedPrompts[1]).toContain('### Test Output');
    expect(capturedPrompts[1]).toContain('FAIL src/app.test.ts');
    expect(capturedPrompts[1]).toContain('Expected: 42');
  });

  it('does not include diff/test sections when unavailable', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn()
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return { success: false, summary: 'Failed attempt', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
      })
      .mockImplementationOnce(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        return {
          success: true,
          summary: 'Succeeded on retry with everything verified and passing correctly',
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.01,
        };
      });

    // No git service, no test output file
    const deps = makeTaskExecutorDeps(executeMock, { git: null });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeTaskOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    // Should still have failure summary but no diff or test sections
    expect(capturedPrompts[1]).toContain('### Previous Failure');
    expect(capturedPrompts[1]).not.toContain('### Workspace Changes');
    expect(capturedPrompts[1]).not.toContain('### Test Output');
  });
});

// ============================================================
// P1 #8: detectTruncations reports fields exceeding Zod caps
// ============================================================

describe('P1 #8: detectTruncations reports overlong fields', () => {
  it('returns empty array for valid spec within caps', () => {
    const warnings = detectTruncations({
      nugget: { goal: 'Build a calculator', type: 'software' },
    });
    expect(warnings).toEqual([]);
  });

  it('detects nugget.goal exceeding 2000 chars', () => {
    const longGoal = 'x'.repeat(2001);
    const warnings = detectTruncations({
      nugget: { goal: longGoal },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe('nugget.goal');
    expect(warnings[0].maxLength).toBe(2000);
    expect(warnings[0].actualLength).toBe(2001);
  });

  it('detects multiple overlong fields', () => {
    const warnings = detectTruncations({
      nugget: { goal: 'x'.repeat(2500), description: 'y'.repeat(3000) },
      runtime: { agent_name: 'z'.repeat(200) },
    });
    expect(warnings).toHaveLength(3);
    const paths = warnings.map((w) => w.path);
    expect(paths).toContain('nugget.goal');
    expect(paths).toContain('nugget.description');
    expect(paths).toContain('runtime.agent_name');
  });

  it('detects overlong fields in array items (skills)', () => {
    const warnings = detectTruncations({
      skills: [
        { name: 'ok', prompt: 'p'.repeat(6000) },
        { description: 'd'.repeat(2500) },
      ],
    });
    expect(warnings).toHaveLength(2);
    expect(warnings[0].path).toBe('skills[0].prompt');
    expect(warnings[0].maxLength).toBe(5000);
    expect(warnings[0].actualLength).toBe(6000);
    expect(warnings[1].path).toBe('skills[1].description');
    expect(warnings[1].maxLength).toBe(2000);
    expect(warnings[1].actualLength).toBe(2500);
  });

  it('detects overlong fields in rules array', () => {
    const warnings = detectTruncations({
      rules: [{ prompt: 'r'.repeat(5500) }],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe('rules[0].prompt');
    expect(warnings[0].maxLength).toBe(5000);
  });

  it('returns empty for null/undefined input', () => {
    expect(detectTruncations(null)).toEqual([]);
    expect(detectTruncations(undefined)).toEqual([]);
    expect(detectTruncations('not an object')).toEqual([]);
  });

  it('ignores fields at or below the cap', () => {
    const warnings = detectTruncations({
      nugget: { goal: 'x'.repeat(2000) }, // exactly at cap
      skills: [{ prompt: 'p'.repeat(5000) }], // exactly at cap
    });
    expect(warnings).toEqual([]);
  });
});

// ============================================================
// P3 #21: task_failed events carry actual retry count
// ============================================================

describe('P3 #21: task_failed retry_count reflects actual attempts', () => {
  it('emits retry_count = actual attempts after exhausting retries', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: false,
      summary: 'Persistent failure that could not be resolved after extensive debugging',
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.005,
    });

    const deps = makeTaskExecutorDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const gateResolver = { current: null as ((v: any) => void) | null };
    const options = makeTaskOptions({ tasks: [task], agents: [agent], gateResolver });

    const resultPromise = executor.executeTask(task, agent, makeCtx(), options);

    // Wait for human gate after 3 failures
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'human_gate')).toBe(true);
    }, { timeout: 5000 });
    gateResolver.current!({ approved: true });

    await resultPromise;

    const failedEvents = events.filter((e) => e.type === 'task_failed');
    expect(failedEvents).toHaveLength(1);
    // After initial attempt + 2 retries = 3 total attempts
    expect(failedEvents[0].retry_count).toBe(3);
  });

  it('emits retry_count = 0 for budget-skipped tasks (never attempted)', async () => {
    const executeMock = makeExecuteMock();
    const tokenTracker = {
      total: 1000,
      maxBudget: 500,
      budgetExceeded: true,
      effectiveBudgetExceeded: true,
      budgetRemaining: 0,
      reservedTokens: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      addForAgent: vi.fn(),
      checkWarning: vi.fn().mockReturnValue(false),
      reserve: vi.fn(),
      releaseReservation: vi.fn(),
    } as any;

    const deps = makeTaskExecutorDeps(executeMock, { tokenTracker });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeTaskOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    const failedEvents = events.filter((e) => e.type === 'task_failed');
    expect(failedEvents).toHaveLength(1);
    // Never attempted, so retry_count should be 0
    expect(failedEvents[0].retry_count).toBe(0);
  });
});
