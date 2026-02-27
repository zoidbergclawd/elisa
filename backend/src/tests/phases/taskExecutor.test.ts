/** Unit tests for TaskExecutor.
 *
 * Tests the extracted single-task execution pipeline: retry loop, token budget
 * pre-check, summary validation, comms file reading, git commit orchestration,
 * context chain updates, human gate logic, and output/question handlers.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -- Module mocks (hoisted) --

vi.mock('../../prompts/builderAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}. Turns: {max_turns}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Build the thing'),
}));

vi.mock('../../prompts/testerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a tester. Turns: {max_turns}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Test the thing'),
}));

vi.mock('../../prompts/reviewerAgent.js', () => ({
  SYSTEM_PROMPT: 'You are {agent_name}, a reviewer. Turns: {max_turns}.',
  formatTaskPrompt: vi.fn().mockReturnValue('Review the thing'),
}));

import { TaskExecutor } from '../../services/phases/taskExecutor.js';
import type { TaskExecutorDeps, TaskExecutionOptions } from '../../services/phases/taskExecutor.js';
import { PromptBuilder } from '../../services/phases/promptBuilder.js';
import { ContextManager } from '../../utils/contextManager.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import { TaskDAG } from '../../utils/dag.js';
import type { PhaseContext } from '../../services/phases/types.js';
import type { BuildSession, Task, Agent, TaskStatus, AgentRole, AgentStatus, CommitInfo } from '../../models/session.js';

// -- Helpers --

let nuggetDir: string;
let events: Record<string, any>[];

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-task-executor-'));
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

function makeDeps(executeMock: ReturnType<typeof vi.fn>, overrides: Partial<TaskExecutorDeps> = {}): TaskExecutorDeps {
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

function makeOptions(overrides: Partial<TaskExecutionOptions> = {}): TaskExecutionOptions {
  const tasks = overrides.tasks ?? [];
  const taskMap: Record<string, Task> = overrides.taskMap ?? {};
  for (const t of tasks) taskMap[t.id] = t;
  const dag = overrides.dag ?? new TaskDAG();
  for (const t of tasks) {
    if (!dag.getReady(new Set()).includes(t.id)) {
      try { dag.addTask(t.id, t.dependencies ?? []); } catch { /* already added */ }
    }
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
// Basic task execution
// ============================================================

describe('basic task execution', () => {
  it('executes a task and returns true on success', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    const result = await executor.executeTask(task, agent, makeCtx(), options);

    expect(result).toBe(true);
    expect(task.status).toBe('done');
    expect(agent.status).toBe('idle');
  });

  it('emits task_started, minion_state_change, and task_completed events', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    const started = events.filter((e) => e.type === 'task_started');
    expect(started.length).toBe(1);
    expect(started[0].task_id).toBe('task-1');
    expect(started[0].agent_name).toBe('Builder Bot');

    const stateChanges = events.filter((e) => e.type === 'minion_state_change');
    expect(stateChanges.length).toBe(1);
    expect(stateChanges[0].old_status).toBe('idle');
    expect(stateChanges[0].new_status).toBe('working');

    const completed = events.filter((e) => e.type === 'task_completed');
    expect(completed.length).toBe(1);
    expect(completed[0].task_id).toBe('task-1');
  });

  it('emits token_usage event with correct values', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    const tokenEvents = events.filter((e) => e.type === 'token_usage');
    expect(tokenEvents.length).toBe(1);
    expect(tokenEvents[0].agent_name).toBe('Builder Bot');
    expect(tokenEvents[0].input_tokens).toBe(100);
    expect(tokenEvents[0].output_tokens).toBe(50);
    expect(tokenEvents[0].cost_usd).toBe(0.01);
  });

  it('tracks tokens in the tokenTracker', async () => {
    const executeMock = makeExecuteMock();
    const tokenTracker = new TokenTracker();
    const deps = makeDeps(executeMock, { tokenTracker });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(tokenTracker.inputTokens).toBe(100);
    expect(tokenTracker.outputTokens).toBe(50);
    expect(tokenTracker.costUsd).toBe(0.01);
  });
});

// ============================================================
// Token budget pre-check
// ============================================================

describe('token budget pre-check', () => {
  it('fails task when token budget is exceeded before execution', async () => {
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
    const deps = makeDeps(executeMock, { tokenTracker });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    const result = await executor.executeTask(task, agent, makeCtx(), options);

    expect(result).toBe(false);
    expect(task.status).toBe('failed');
    expect(executeMock).not.toHaveBeenCalled();

    const failedEvents = events.filter((e) => e.type === 'task_failed');
    expect(failedEvents.length).toBe(1);
    expect(failedEvents[0].error).toContain('Token budget exceeded');
  });
});

// ============================================================
// Retry loop
// ============================================================

describe('retry loop', () => {
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

    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    const result = await executor.executeTask(task, agent, makeCtx(), options);

    expect(result).toBe(true);
    expect(task.status).toBe('done');
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it('prepends retry context to prompt on retries', async () => {
    const capturedPrompts: string[] = [];
    const executeMock = vi.fn()
      .mockImplementation(async (opts: any) => {
        capturedPrompts.push(opts.prompt);
        if (capturedPrompts.length === 1) {
          return { success: false, summary: 'Failed', inputTokens: 50, outputTokens: 20, costUsd: 0.005 };
        }
        return { success: true, summary: 'Succeeded on retry with all tests passing', inputTokens: 100, outputTokens: 50, costUsd: 0.01 };
      });

    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    // First prompt should not have retry context
    expect(capturedPrompts[0]).not.toContain('Retry Attempt');
    // Second prompt should have retry context
    expect(capturedPrompts[1]).toContain('Retry Attempt 1');
    expect(capturedPrompts[1]).toContain('Skip orientation');
  });

  it('fails after all 3 attempts exhausted and fires human gate', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: false,
      summary: 'Persistent failure that could not be resolved after attempts',
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.005,
    });

    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const gateResolver = { current: null as ((v: Record<string, any>) => void) | null };
    const options = makeOptions({ tasks: [task], agents: [agent], gateResolver });

    // Run in background and resolve gate
    const resultPromise = executor.executeTask(task, agent, makeCtx(), options);

    // Wait for human_gate event
    await vi.waitFor(
      () => { expect(events.some((e) => e.type === 'human_gate')).toBe(true); },
      { timeout: 5000 },
    );

    // Approve gate to unblock
    expect(gateResolver.current).not.toBeNull();
    gateResolver.current!({ approved: true });

    const result = await resultPromise;

    expect(result).toBe(false);
    expect(task.status).toBe('failed');
    expect(executeMock).toHaveBeenCalledTimes(3);

    const failedEvents = events.filter((e) => e.type === 'task_failed');
    expect(failedEvents.length).toBe(1);
    expect(failedEvents[0].retry_count).toBe(3);
  });

  it('emits retry agent_output between attempts', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce({
        success: false,
        summary: 'Failed',
        inputTokens: 50,
        outputTokens: 20,
        costUsd: 0.005,
      })
      .mockResolvedValueOnce({
        success: true,
        summary: 'Succeeded on retry with all tests passing and verified output',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });

    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    const retryOutputs = events.filter(
      (e) => e.type === 'agent_output' && e.content.includes('Retrying'),
    );
    expect(retryOutputs.length).toBe(1);
    expect(retryOutputs[0].content).toContain('attempt 2');
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

    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const taskSummaries: Record<string, string> = {};
    const options = makeOptions({ tasks: [task], agents: [agent], taskSummaries });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(taskSummaries['task-1']).toBe(
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

    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const taskSummaries: Record<string, string> = {};
    const options = makeOptions({ tasks: [task], agents: [agent], taskSummaries });

    await executor.executeTask(task, agent, makeCtx(), options);

    const words = taskSummaries['task-1'].split(/\s+/).filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(501);
    expect(taskSummaries['task-1']).toContain('[truncated]');
  });

  it('reads comms file and overrides agent summary', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: true,
      summary: 'Agent inline summary that is long enough to pass validation checks',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
    });

    // Write a comms file
    const commsContent = 'Comms file summary: detailed description of what was done including implementation details and test results verification';
    fs.writeFileSync(
      path.join(nuggetDir, '.elisa', 'comms', 'task-1_summary.md'),
      commsContent,
      'utf-8',
    );

    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const taskSummaries: Record<string, string> = {};
    const options = makeOptions({ tasks: [task], agents: [agent], taskSummaries });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(taskSummaries['task-1']).toBe(commsContent);
  });
});

// ============================================================
// Context chain updates
// ============================================================

describe('context chain', () => {
  it('writes nugget_context.md after successful task', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    const contextPath = path.join(nuggetDir, '.elisa', 'context', 'nugget_context.md');
    expect(fs.existsSync(contextPath)).toBe(true);
    const content = fs.readFileSync(contextPath, 'utf-8');
    expect(content).toContain('task-1');
  });

  it('writes current_state.json after successful task', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    const statePath = path.join(nuggetDir, '.elisa', 'status', 'current_state.json');
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.tasks).toBeDefined();
  });

  it('emits context_flow event for dependent tasks', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task1 = makeTask('task-1', 'Build Foundation', 'Builder Bot');
    const task2 = makeTask('task-2', 'Build Walls', 'Builder Bot', ['task-1']);
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task1, task2], agents: [agent] });

    await executor.executeTask(task1, agent, makeCtx(), options);

    const flowEvents = events.filter((e) => e.type === 'context_flow');
    expect(flowEvents.length).toBe(1);
    expect(flowEvents[0].from_task_id).toBe('task-1');
    expect(flowEvents[0].to_task_ids).toContain('task-2');
  });

  it('does not emit context_flow when no dependents exist', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    const flowEvents = events.filter((e) => e.type === 'context_flow');
    expect(flowEvents.length).toBe(0);
  });
});

// ============================================================
// Git commit orchestration
// ============================================================

describe('git commit', () => {
  it('calls git commit via gitMutex and pushes to commits array', async () => {
    const executeMock = makeExecuteMock();
    const mockCommitInfo: CommitInfo = {
      sha: 'abc123',
      shortSha: 'abc1234',
      message: 'Builder Bot: Build UI',
      agentName: 'Builder Bot',
      taskId: 'task-1',
      timestamp: new Date().toISOString(),
      filesChanged: ['src/index.ts'],
    };
    const gitService = {
      commit: vi.fn().mockResolvedValue(mockCommitInfo),
    } as any;
    const deps = makeDeps(executeMock, { git: gitService });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const commits: CommitInfo[] = [];
    const options = makeOptions({ tasks: [task], agents: [agent], commits });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(gitService.commit).toHaveBeenCalledWith(
      nuggetDir, 'Builder Bot: Build UI', 'Builder Bot', 'task-1',
    );
    expect(commits.length).toBe(1);
    expect(commits[0].sha).toBe('abc123');

    const commitEvents = events.filter((e) => e.type === 'commit_created');
    expect(commitEvents.length).toBe(1);
    expect(commitEvents[0].sha).toBe('abc1234');
  });

  it('handles git commit failure gracefully', async () => {
    const executeMock = makeExecuteMock();
    const gitService = {
      commit: vi.fn().mockRejectedValue(new Error('git error')),
    } as any;
    const deps = makeDeps(executeMock, { git: gitService });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    // Should not throw
    const result = await executor.executeTask(task, agent, makeCtx(), options);

    expect(result).toBe(true);
    expect(task.status).toBe('done');
  });

  it('skips git commit when git is null', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { git: null });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    const result = await executor.executeTask(task, agent, makeCtx(), options);

    expect(result).toBe(true);
    const commitEvents = events.filter((e) => e.type === 'commit_created');
    expect(commitEvents.length).toBe(0);
  });

  it('uses gitMutex for serialization', async () => {
    const executeMock = makeExecuteMock();
    const mutexCalls: string[] = [];
    const gitService = {
      commit: vi.fn().mockImplementation(async () => {
        mutexCalls.push('commit');
        return { sha: 'abc', shortSha: 'abc', message: 'm', agentName: 'a', taskId: 't', timestamp: '', filesChanged: [] };
      }),
    } as any;
    const deps = makeDeps(executeMock, { git: gitService });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({
      tasks: [task],
      agents: [agent],
      gitMutex: async (fn) => {
        mutexCalls.push('mutex-enter');
        await fn();
        mutexCalls.push('mutex-exit');
      },
    });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(mutexCalls).toEqual(['mutex-enter', 'commit', 'mutex-exit']);
  });
});

// ============================================================
// Human gate
// ============================================================

describe('human gate', () => {
  it('shouldFireGate returns true at midpoint with human_gates configured', () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const tasks = [
      makeTask('task-1', 'Step 1', 'Agent-A'),
      makeTask('task-2', 'Step 2', 'Agent-A'),
      makeTask('task-3', 'Step 3', 'Agent-A'),
      makeTask('task-4', 'Step 4', 'Agent-A'),
    ];
    const ctx = makeCtx({
      session: {
        id: 'test-session',
        state: 'executing',
        spec: {
          nugget: { goal: 'test', type: 'software', description: 'test' },
          workflow: { human_gates: ['midpoint'] },
        },
        tasks: [],
        agents: [],
      } as any,
    });
    const options = makeOptions({ tasks, completed: new Set(['task-1']) });

    // Midpoint for 4 tasks = floor(4/2) = 2. doneCount = completed.size + 1 = 2.
    const result = executor.shouldFireGate(ctx, tasks[1], options);
    expect(result).toBe(true);
  });

  it('shouldFireGate returns false when no human_gates configured', () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const tasks = [
      makeTask('task-1', 'Step 1', 'Agent-A'),
      makeTask('task-2', 'Step 2', 'Agent-A'),
    ];
    const ctx = makeCtx();
    const options = makeOptions({ tasks, completed: new Set(['task-1']) });

    const result = executor.shouldFireGate(ctx, tasks[0], options);
    expect(result).toBe(false);
  });

  it('fireHumanGate creates revision task on rejection', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const dag = new TaskDAG();
    dag.addTask('task-1', []);
    const gateResolver = { current: null as ((v: Record<string, any>) => void) | null };
    const tasks = [task];
    const taskMap: Record<string, Task> = { 'task-1': task };
    const options = makeOptions({ tasks, taskMap, gateResolver, dag });

    const gatePromise = executor.fireHumanGate(makeCtx(), task, options);

    // Wait for human_gate event
    await vi.waitFor(
      () => { expect(events.some((e) => e.type === 'human_gate')).toBe(true); },
      { timeout: 2000 },
    );

    // Reject with feedback
    gateResolver.current!({ approved: false, feedback: 'Make it blue' });

    await gatePromise;

    // Revision task should be created
    const revisionTask = tasks.find((t) => t.id.includes('revision'));
    expect(revisionTask).toBeDefined();
    expect(revisionTask!.description).toContain('Make it blue');
    expect(revisionTask!.dependencies).toContain('task-1');
    expect(taskMap[revisionTask!.id]).toBeDefined();
  });
});

// ============================================================
// Feedback loop tracker integration
// ============================================================

describe('feedback loop tracker', () => {
  it('notifies tracker on attempt start and success', async () => {
    const executeMock = makeExecuteMock();
    const feedbackLoopTracker = {
      startAttempt: vi.fn(),
      markFixing: vi.fn(),
      markRetesting: vi.fn(),
      recordAttemptResult: vi.fn(),
    } as any;
    const deps = makeDeps(executeMock, { feedbackLoopTracker });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(feedbackLoopTracker.startAttempt).toHaveBeenCalledWith('task-1', 'Build UI', 0, undefined);
    expect(feedbackLoopTracker.recordAttemptResult).toHaveBeenCalledWith('task-1', true);
    expect(feedbackLoopTracker.markFixing).not.toHaveBeenCalled();
    expect(feedbackLoopTracker.markRetesting).not.toHaveBeenCalled();
  });

  it('notifies tracker of fixing and retesting on retry', async () => {
    const executeMock = vi.fn()
      .mockResolvedValueOnce({
        success: false,
        summary: 'Failed due to compilation error',
        inputTokens: 50,
        outputTokens: 20,
        costUsd: 0.005,
      })
      .mockResolvedValueOnce({
        success: true,
        summary: 'Fixed and all tests pass now with verification complete',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
      });

    const feedbackLoopTracker = {
      startAttempt: vi.fn(),
      markFixing: vi.fn(),
      markRetesting: vi.fn(),
      recordAttemptResult: vi.fn(),
    } as any;
    const deps = makeDeps(executeMock, { feedbackLoopTracker });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    // Should have been called for both attempts
    expect(feedbackLoopTracker.startAttempt).toHaveBeenCalledTimes(2);
    expect(feedbackLoopTracker.startAttempt).toHaveBeenCalledWith('task-1', 'Build UI', 0, undefined);
    expect(feedbackLoopTracker.startAttempt).toHaveBeenCalledWith('task-1', 'Build UI', 1, 'Failed due to compilation error');

    // Fixing and retesting should fire on retry
    expect(feedbackLoopTracker.markFixing).toHaveBeenCalledWith('task-1');
    expect(feedbackLoopTracker.markRetesting).toHaveBeenCalledWith('task-1');

    // First attempt failed, second succeeded
    expect(feedbackLoopTracker.recordAttemptResult).toHaveBeenCalledWith('task-1', false);
    expect(feedbackLoopTracker.recordAttemptResult).toHaveBeenCalledWith('task-1', true);
  });
});

// ============================================================
// Narrator integration
// ============================================================

describe('narrator integration', () => {
  it('calls narrator on task_started event', async () => {
    const executeMock = makeExecuteMock();
    const narratorService = {
      translate: vi.fn().mockResolvedValue({ text: 'Builder Bot is starting!', mood: 'excited' }),
      recordEmission: vi.fn(),
      accumulateOutput: vi.fn(),
      flushTask: vi.fn(),
    } as any;
    const deps = makeDeps(executeMock, { narratorService });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(narratorService.translate).toHaveBeenCalledWith(
      'task_started', 'Builder Bot', 'Build UI', 'test goal',
    );
    expect(narratorService.translate).toHaveBeenCalledWith(
      'task_completed', 'Builder Bot', expect.any(String), 'test goal',
    );

    const narratorEvents = events.filter((e) => e.type === 'narrator_message');
    expect(narratorEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('flushes narrator on task completion', async () => {
    const executeMock = makeExecuteMock();
    const narratorService = {
      translate: vi.fn().mockResolvedValue(null),
      recordEmission: vi.fn(),
      accumulateOutput: vi.fn(),
      flushTask: vi.fn(),
    } as any;
    const deps = makeDeps(executeMock, { narratorService });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(narratorService.flushTask).toHaveBeenCalledWith('task-1');
  });
});

// ============================================================
// Teaching moments
// ============================================================

describe('teaching moments', () => {
  it('checks for teaching moment on tester task completion', async () => {
    const executeMock = makeExecuteMock();
    const teachingEngine = { getMoment: vi.fn().mockResolvedValue(null) } as any;
    const deps = makeDeps(executeMock, { teachingEngine });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Run tests', 'Tester Bot');
    const agent = makeAgent('Tester Bot', 'tester');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(teachingEngine.getMoment).toHaveBeenCalledWith(
      'tester_task_completed', expect.any(String), 'software',
    );
  });

  it('checks for teaching moment on reviewer task completion', async () => {
    const executeMock = makeExecuteMock();
    const teachingEngine = { getMoment: vi.fn().mockResolvedValue(null) } as any;
    const deps = makeDeps(executeMock, { teachingEngine });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Code review', 'Reviewer Bot');
    const agent = makeAgent('Reviewer Bot', 'reviewer');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    expect(teachingEngine.getMoment).toHaveBeenCalledWith(
      'reviewer_task_completed', expect.any(String), 'software',
    );
  });
});

// ============================================================
// makeOutputHandler
// ============================================================

describe('makeOutputHandler', () => {
  it('emits agent_output event', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const ctx = makeCtx();

    const handler = executor.makeOutputHandler(ctx, 'Builder Bot');
    await handler('task-1', 'Working on it...');

    const outputs = events.filter((e) => e.type === 'agent_output');
    expect(outputs.length).toBe(1);
    expect(outputs[0].content).toBe('Working on it...');
    expect(outputs[0].agent_name).toBe('Builder Bot');
  });

  it('accumulates output in narrator when present', async () => {
    const executeMock = makeExecuteMock();
    const narratorService = {
      translate: vi.fn(),
      recordEmission: vi.fn(),
      accumulateOutput: vi.fn(),
      flushTask: vi.fn(),
    } as any;
    const deps = makeDeps(executeMock, { narratorService });
    const executor = new TaskExecutor(deps);
    const ctx = makeCtx();

    const handler = executor.makeOutputHandler(ctx, 'Builder Bot');
    await handler('task-1', 'Building...');

    expect(narratorService.accumulateOutput).toHaveBeenCalledWith(
      'task-1', 'Building...', 'Builder Bot', 'test goal', expect.any(Function),
    );
  });
});

// ============================================================
// makeQuestionHandler
// ============================================================

describe('makeQuestionHandler', () => {
  it('emits user_question event when no permission policy', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const ctx = makeCtx();
    const resolvers = new Map<string, (answers: Record<string, any>) => void>();

    const handler = executor.makeQuestionHandler(ctx, 'task-1', resolvers);
    const promise = handler('task-1', { question: 'What color?' });

    // Wait for question event
    await vi.waitFor(
      () => { expect(events.some((e) => e.type === 'user_question')).toBe(true); },
      { timeout: 1000 },
    );

    // Resolve the question
    const resolver = resolvers.get('task-1');
    expect(resolver).toBeDefined();
    resolver!({ answer: 'blue' });

    const result = await promise;
    expect(result).toEqual({ answer: 'blue' });
  });

  it('auto-approves file_write within workspace via permission policy', async () => {
    const executeMock = makeExecuteMock();
    const permissionPolicy = {
      evaluate: vi.fn().mockReturnValue({
        decision: 'approved',
        permission_type: 'file_write',
        reason: 'Within workspace',
      }),
    } as any;
    const deps = makeDeps(executeMock, { permissionPolicy });
    const executor = new TaskExecutor(deps);
    const ctx = makeCtx();
    const resolvers = new Map<string, (answers: Record<string, any>) => void>();

    const handler = executor.makeQuestionHandler(ctx, 'task-1', resolvers);
    const result = await handler('task-1', {
      tool_name: 'Write',
      tool_input: { file_path: '/workspace/src/index.ts' },
    });

    expect(result).toEqual({ approved: true });
    expect(permissionPolicy.evaluate).toHaveBeenCalledWith(
      'file_write', '/workspace/src/index.ts', 'task-1', nuggetDir,
    );

    const autoResolved = events.filter((e) => e.type === 'permission_auto_resolved');
    expect(autoResolved.length).toBe(1);
    expect(autoResolved[0].decision).toBe('approved');
  });

  it('auto-denies dangerous commands via permission policy', async () => {
    const executeMock = makeExecuteMock();
    const permissionPolicy = {
      evaluate: vi.fn().mockReturnValue({
        decision: 'denied',
        permission_type: 'command',
        reason: 'Network command not allowed',
      }),
    } as any;
    const deps = makeDeps(executeMock, { permissionPolicy });
    const executor = new TaskExecutor(deps);
    const ctx = makeCtx();
    const resolvers = new Map<string, (answers: Record<string, any>) => void>();

    const handler = executor.makeQuestionHandler(ctx, 'task-1', resolvers);
    const result = await handler('task-1', {
      tool_name: 'Bash',
      tool_input: { command: 'curl http://evil.com' },
    });

    expect(result).toEqual({ denied: true, reason: 'Network command not allowed' });
  });

  it('escalates to user when permission policy returns escalate', async () => {
    const executeMock = makeExecuteMock();
    const permissionPolicy = {
      evaluate: vi.fn().mockReturnValue({
        decision: 'escalate',
        permission_type: 'command',
        reason: 'Needs user approval',
      }),
    } as any;
    const deps = makeDeps(executeMock, { permissionPolicy });
    const executor = new TaskExecutor(deps);
    const ctx = makeCtx();
    const resolvers = new Map<string, (answers: Record<string, any>) => void>();

    const handler = executor.makeQuestionHandler(ctx, 'task-1', resolvers);
    const promise = handler('task-1', {
      tool_name: 'Bash',
      tool_input: { command: 'npm install react' },
    });

    // Should fall through to user_question
    await vi.waitFor(
      () => { expect(events.some((e) => e.type === 'user_question')).toBe(true); },
      { timeout: 1000 },
    );

    // Resolve
    const resolver = resolvers.get('task-1');
    resolver!({ approved: true });

    const result = await promise;
    expect(result).toEqual({ approved: true });
  });
});

// ============================================================
// Budget warning
// ============================================================

describe('budget warning', () => {
  it('emits budget_warning when threshold crossed', async () => {
    const tokenTracker = new TokenTracker(180);
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock, { tokenTracker });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    // 100 + 50 = 150, >= 80% of 180 (=144)
    const warnings = events.filter((e) => e.type === 'budget_warning');
    expect(warnings.length).toBe(1);
    expect(warnings[0].total_tokens).toBe(150);
    expect(warnings[0].max_budget).toBe(180);
  });
});

// ============================================================
// Agent message
// ============================================================

describe('agent message', () => {
  it('emits agent_message with summary on success', async () => {
    const executeMock = makeExecuteMock();
    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const options = makeOptions({ tasks: [task], agents: [agent] });

    await executor.executeTask(task, agent, makeCtx(), options);

    const msgs = events.filter((e) => e.type === 'agent_message');
    expect(msgs.length).toBe(1);
    expect(msgs[0].from).toBe('Builder Bot');
    expect(msgs[0].to).toBe('team');
    expect(msgs[0].content.length).toBeLessThanOrEqual(500);
  });
});

// ============================================================
// Failure path
// ============================================================

describe('failure handling', () => {
  it('sets task status to failed and agent to error', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: false,
      summary: 'Something went wrong during the build process',
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.005,
    });

    const deps = makeDeps(executeMock);
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const gateResolver = { current: null as ((v: Record<string, any>) => void) | null };
    const options = makeOptions({ tasks: [task], agents: [agent], gateResolver });

    const resultPromise = executor.executeTask(task, agent, makeCtx(), options);

    // Wait for human_gate event (fires after 3 failed attempts)
    await vi.waitFor(
      () => { expect(events.some((e) => e.type === 'human_gate')).toBe(true); },
      { timeout: 5000 },
    );
    gateResolver.current!({ approved: true });

    const result = await resultPromise;

    expect(result).toBe(false);
    expect(task.status).toBe('failed');
    expect(agent.status).toBe('error');
  });

  it('flushes narrator on failure', async () => {
    const executeMock = vi.fn().mockResolvedValue({
      success: false,
      summary: 'Build failed',
      inputTokens: 50,
      outputTokens: 20,
      costUsd: 0.005,
    });

    const narratorService = {
      translate: vi.fn().mockResolvedValue(null),
      recordEmission: vi.fn(),
      accumulateOutput: vi.fn(),
      flushTask: vi.fn(),
    } as any;
    const deps = makeDeps(executeMock, { narratorService });
    const executor = new TaskExecutor(deps);
    const task = makeTask('task-1', 'Build UI', 'Builder Bot');
    const agent = makeAgent('Builder Bot');
    const gateResolver = { current: null as ((v: Record<string, any>) => void) | null };
    const options = makeOptions({ tasks: [task], agents: [agent], gateResolver });

    const resultPromise = executor.executeTask(task, agent, makeCtx(), options);

    await vi.waitFor(
      () => { expect(events.some((e) => e.type === 'human_gate')).toBe(true); },
      { timeout: 5000 },
    );
    gateResolver.current!({ approved: true });

    await resultPromise;

    expect(narratorService.flushTask).toHaveBeenCalledWith('task-1');
    expect(narratorService.translate).toHaveBeenCalledWith(
      'task_failed', 'Builder Bot', expect.any(String), 'test goal',
    );
  });
});
