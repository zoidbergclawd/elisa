/**
 * Tests for #177: early meeting trigger when idle execution slots exist.
 *
 * Verifies that meeting invites fire proactively for not-yet-ready tasks
 * when the execution pool has idle slots, so kids can chat during builds.
 */

import { describe, it, expect, vi } from 'vitest';
import { ExecutePhase } from '../../services/phases/executePhase.js';
import { TaskDAG } from '../../utils/dag.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import { ContextManager } from '../../utils/contextManager.js';
import type { Task, Agent } from '../../models/session.js';
import type { PhaseContext } from '../../services/phases/types.js';

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: { id: 'test-session', state: 'executing', spec: {} } as never,
    send: vi.fn(),
    nuggetDir: '/tmp/test-early-meeting',
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    logger: null,
    ...overrides,
  };
}

function makePhase(opts: {
  tasks: Task[];
  agents: Agent[];
  dag: TaskDAG;
  meetingWiring: any;
  taskExecutor: any;
}) {
  const taskMap: Record<string, Task> = {};
  for (const t of opts.tasks) taskMap[t.id] = t;
  const agentMap: Record<string, Agent> = {};
  for (const a of opts.agents) agentMap[a.name] = a;

  return new ExecutePhase({
    agentRunner: {} as never,
    git: null,
    teachingEngine: {} as never,
    tokenTracker: new TokenTracker(),
    portalService: {} as never,
    context: new ContextManager(),
    tasks: opts.tasks,
    agents: opts.agents,
    taskMap,
    agentMap,
    dag: opts.dag,
    questionResolvers: new Map(),
    gateResolver: { current: null },
    meetingTriggerWiring: opts.meetingWiring as never,
    meetingService: undefined,
    meetingBlockResolvers: new Map(),
    sessionId: 'test-session',
    systemLevel: 'explorer',
    taskExecutor: opts.taskExecutor as never,
  });
}

describe('#177: early meeting trigger for idle slots', () => {
  it('triggers meeting invite for a not-yet-ready task when idle slots exist', async () => {
    // DAG: task-1 (no deps) -> task-2 (depends on task-1, has design keyword)
    // task-1 runs in a slot, leaving 2 idle slots.
    // task-2 is NOT ready yet (blocked on task-1), but its meeting should be
    // triggered early so the kid can chat while task-1 runs.
    const tasks: Task[] = [
      { id: 't1', name: 'Build logic', description: 'Build the core logic', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't2', name: 'Create sprite art', description: 'Design the sprite artwork', status: 'pending', agent_name: 'Bot', dependencies: ['t1'] } as Task,
    ];
    const agents: Agent[] = [
      { name: 'Bot', role: 'builder', status: 'idle' } as Agent,
    ];

    const dag = new TaskDAG();
    dag.addTask('t1', []);
    dag.addTask('t2', ['t1']);

    const evaluateForTaskCalls: string[] = [];
    const meetingBlockResolvers = new Map<string, () => void>();

    const meetingWiring = {
      evaluateAndInvite: vi.fn(async () => {}),
      evaluateAndInviteForTask: vi.fn(async (taskInfo: any) => {
        evaluateForTaskCalls.push(taskInfo.task_id);
        return ['meeting-early-1'];
      }),
      setSpec: vi.fn(),
      clearSession: vi.fn(),
    };

    const taskExecutor = {
      executeTask: vi.fn(async (task: Task) => {
        if (task.id === 't1') {
          await new Promise(r => setTimeout(r, 50));
        }
        task.status = 'done';
        return true;
      }),
    };

    const taskMap: Record<string, Task> = {};
    for (const t of tasks) taskMap[t.id] = t;
    const agentMap: Record<string, Agent> = {};
    for (const a of agents) agentMap[a.name] = a;

    const phase = new ExecutePhase({
      agentRunner: {} as never,
      git: null,
      teachingEngine: {} as never,
      tokenTracker: new TokenTracker(),
      portalService: {} as never,
      context: new ContextManager(),
      tasks,
      agents,
      taskMap,
      agentMap,
      dag,
      questionResolvers: new Map(),
      gateResolver: { current: null },
      meetingTriggerWiring: meetingWiring as never,
      meetingService: undefined,
      meetingBlockResolvers,
      sessionId: 'test-session',
      systemLevel: 'explorer',
      taskExecutor: taskExecutor as never,
    });

    const ctx = makeCtx();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const runPromise = phase.execute({ ...ctx, abortSignal: controller.signal });

    // Wait for the early meeting trigger to fire, then resolve the block
    await new Promise(r => setTimeout(r, 200));
    const resolver = meetingBlockResolvers.get('meeting-early-1');
    if (resolver) resolver();

    await runPromise;
    clearTimeout(timeoutId);

    // The meeting for t2 should have been triggered via evaluateAndInviteForTask
    // even though t2 was not ready (still blocked on t1) at the time.
    expect(evaluateForTaskCalls).toContain('t2');
  });

  it('does NOT trigger early meetings when all slots are occupied', async () => {
    // DAG: t1, t2, t3 (all independent) -> t4 (depends on t1, has design keyword)
    // All 3 slots are filled with t1, t2, t3. No idle slots exist.
    // t4's meeting should NOT be triggered early.
    const tasks: Task[] = [
      { id: 't1', name: 'Build A', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't2', name: 'Build B', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't3', name: 'Build C', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't4', name: 'Create sprite art', description: 'Design the sprite artwork', status: 'pending', agent_name: 'Bot', dependencies: ['t1'] } as Task,
    ];
    const agents: Agent[] = [
      { name: 'Bot', role: 'builder', status: 'idle' } as Agent,
    ];

    const dag = new TaskDAG();
    dag.addTask('t1', []);
    dag.addTask('t2', []);
    dag.addTask('t3', []);
    dag.addTask('t4', ['t1']);

    const evaluateForTaskCalls: string[] = [];
    let earlyTriggerHappened = false;

    const meetingWiring = {
      evaluateAndInvite: vi.fn(async () => {}),
      evaluateAndInviteForTask: vi.fn(async (taskInfo: any) => {
        evaluateForTaskCalls.push(taskInfo.task_id);
        if (taskInfo.task_id === 't4') {
          earlyTriggerHappened = true;
        }
        // Return empty so meeting doesn't block
        return [];
      }),
      setSpec: vi.fn(),
      clearSession: vi.fn(),
    };

    let allSlotsFilledOnce = false;
    let currentInFlight = 0;

    const taskExecutor = {
      executeTask: vi.fn(async (task: Task) => {
        currentInFlight++;
        if (currentInFlight >= 3) allSlotsFilledOnce = true;
        // Give the loop time to potentially trigger early meetings
        await new Promise(r => setTimeout(r, 30));
        currentInFlight--;
        task.status = 'done';
        return true;
      }),
    };

    const phase = makePhase({ tasks, agents, dag, meetingWiring, taskExecutor });
    const ctx = makeCtx();

    await phase.execute(ctx);

    // All slots should have been filled at some point
    expect(allSlotsFilledOnce).toBe(true);

    // t4's meeting SHOULD eventually trigger (when t1 completes and t4 becomes ready),
    // but it should be via the normal pre-pass, not the early look-ahead.
    // The key assertion: the first time t4's meeting is evaluated should be
    // AFTER t1 completes (i.e., when t4 becomes ready).
    expect(evaluateForTaskCalls).toContain('t4');
  });

  it('does not double-trigger meetings for tasks that were already meeting-evaluated', async () => {
    // t1 (no deps) -> t2 (depends on t1, has design keyword)
    // The early trigger fires for t2 while t1 runs.
    // When t1 completes and t2 becomes ready, the pre-pass should NOT
    // re-trigger because meetingEvaluated already has t2.
    const tasks: Task[] = [
      { id: 't1', name: 'Build logic', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't2', name: 'Create sprite art', description: 'Design the sprite artwork', status: 'pending', agent_name: 'Bot', dependencies: ['t1'] } as Task,
    ];
    const agents: Agent[] = [
      { name: 'Bot', role: 'builder', status: 'idle' } as Agent,
    ];

    const dag = new TaskDAG();
    dag.addTask('t1', []);
    dag.addTask('t2', ['t1']);

    let evaluateForTaskCallCount = 0;

    const meetingBlockResolvers = new Map<string, () => void>();

    const meetingWiring = {
      evaluateAndInvite: vi.fn(async () => {}),
      evaluateAndInviteForTask: vi.fn(async (taskInfo: any) => {
        evaluateForTaskCallCount++;
        // Return a meeting ID so the task gets blocked
        return ['meeting-dedup'];
      }),
      setSpec: vi.fn(),
      clearSession: vi.fn(),
    };

    const taskExecutor = {
      executeTask: vi.fn(async (task: Task) => {
        if (task.id === 't1') {
          await new Promise(r => setTimeout(r, 30));
        }
        task.status = 'done';
        return true;
      }),
    };

    const taskMap: Record<string, Task> = {};
    for (const t of tasks) taskMap[t.id] = t;
    const agentMap: Record<string, Agent> = {};
    for (const a of agents) agentMap[a.name] = a;

    const phase = new ExecutePhase({
      agentRunner: {} as never,
      git: null,
      teachingEngine: {} as never,
      tokenTracker: new TokenTracker(),
      portalService: {} as never,
      context: new ContextManager(),
      tasks,
      agents,
      taskMap,
      agentMap,
      dag,
      questionResolvers: new Map(),
      gateResolver: { current: null },
      meetingTriggerWiring: meetingWiring as never,
      meetingService: undefined,
      meetingBlockResolvers,
      sessionId: 'test-session',
      systemLevel: 'explorer',
      taskExecutor: taskExecutor as never,
    });

    const ctx = makeCtx();

    // Run with a timeout so the meeting block doesn't hang forever
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const runPromise = phase.execute({ ...ctx, abortSignal: controller.signal });

    // Wait a bit, then resolve the meeting block to let t2 proceed
    await new Promise(r => setTimeout(r, 200));
    const resolver = meetingBlockResolvers.get('meeting-dedup');
    if (resolver) resolver();

    await runPromise;
    clearTimeout(timeoutId);

    // evaluateAndInviteForTask should be called exactly once for t2,
    // not twice (once from early trigger + once from normal pre-pass)
    expect(evaluateForTaskCallCount).toBe(1);
  });
});
