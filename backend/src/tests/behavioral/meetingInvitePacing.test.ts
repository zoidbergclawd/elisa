/**
 * Tests for #178: Pace meeting invites by sequential gating.
 *
 * When multiple design tasks are ready simultaneously, only one meeting
 * should trigger at a time. After it resolves, the next one fires.
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
    nuggetDir: '/tmp/test-meeting-pacing',
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
  meetingBlockResolvers: Map<string, () => void>;
  taskExecutor: any;
  meetingService?: any;
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
    meetingService: opts.meetingService,
    meetingBlockResolvers: opts.meetingBlockResolvers,
    sessionId: 'test-session',
    systemLevel: 'explorer',
    taskExecutor: opts.taskExecutor as never,
  });
}

describe('#178: Sequential gating for design review meetings', () => {
  it('with 3 design tasks ready simultaneously, only 1 meeting triggers initially', async () => {
    // 3 independent design tasks -- all ready at the same time
    const tasks: Task[] = [
      { id: 't1', name: 'Create sprite art', description: 'Design the character sprite', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't2', name: 'Draw icon set', description: 'Design the icon artwork', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't3', name: 'Design theme art', description: 'Create the theme artwork', status: 'pending', agent_name: 'Bot' } as Task,
    ];
    const agents: Agent[] = [
      { name: 'Bot', role: 'builder', status: 'idle' } as Agent,
    ];

    const dag = new TaskDAG();
    dag.addTask('t1', []);
    dag.addTask('t2', []);
    dag.addTask('t3', []);

    const meetingBlockResolvers = new Map<string, () => void>();
    const inviteOrder: string[] = [];
    let inviteCounter = 0;

    const meetingWiring = {
      evaluateAndInvite: vi.fn(async () => {}),
      evaluateAndInviteForTask: vi.fn(async (taskInfo: any) => {
        inviteOrder.push(taskInfo.task_id);
        inviteCounter++;
        return [`meeting-${taskInfo.task_id}`];
      }),
      setSpec: vi.fn(),
      clearSession: vi.fn(),
    };

    const taskExecutor = {
      executeTask: vi.fn(async (task: Task) => {
        task.status = 'done';
        return true;
      }),
    };

    const phase = makePhase({
      tasks,
      agents,
      dag,
      meetingWiring,
      meetingBlockResolvers,
      taskExecutor,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const ctx = makeCtx({ abortSignal: controller.signal });

    const runPromise = phase.execute(ctx);

    // Wait for the first meeting invite to fire
    await new Promise(r => setTimeout(r, 300));

    // Key assertion: only 1 invite should have fired so far, not 3
    expect(inviteCounter).toBe(1);
    expect(inviteOrder).toHaveLength(1);

    // Resolve the first meeting
    const firstTaskId = inviteOrder[0];
    const resolver1 = meetingBlockResolvers.get(`meeting-${firstTaskId}`);
    expect(resolver1).toBeDefined();
    resolver1!();

    // Wait for the second meeting to trigger (loop poll + re-evaluation)
    // The loop polls every 200ms, so we need to wait for at least one poll cycle
    // plus the async evaluation time.
    await vi.waitFor(() => {
      expect(inviteCounter).toBe(2);
    }, { timeout: 2000, interval: 50 });

    // Resolve the second meeting
    const secondTaskId = inviteOrder[1];
    const resolver2 = meetingBlockResolvers.get(`meeting-${secondTaskId}`);
    expect(resolver2).toBeDefined();
    resolver2!();

    // Wait for the third meeting to trigger
    await new Promise(r => setTimeout(r, 500));
    expect(inviteCounter).toBe(3);

    // Resolve the third meeting
    const thirdTaskId = inviteOrder[2];
    const resolver3 = meetingBlockResolvers.get(`meeting-${thirdTaskId}`);
    expect(resolver3).toBeDefined();
    resolver3!();

    await runPromise;
    clearTimeout(timeoutId);

    // All 3 meetings should have fired sequentially
    expect(inviteOrder).toHaveLength(3);
    // All 3 tasks should have completed
    expect(taskExecutor.executeTask).toHaveBeenCalledTimes(3);
  });

  it('after the first meeting resolves, the next one triggers', async () => {
    // 2 independent design tasks
    const tasks: Task[] = [
      { id: 't1', name: 'Create sprite art', description: 'Design the character sprite', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't2', name: 'Draw icon art', description: 'Design the icon artwork', status: 'pending', agent_name: 'Bot' } as Task,
    ];
    const agents: Agent[] = [
      { name: 'Bot', role: 'builder', status: 'idle' } as Agent,
    ];

    const dag = new TaskDAG();
    dag.addTask('t1', []);
    dag.addTask('t2', []);

    const meetingBlockResolvers = new Map<string, () => void>();
    const inviteTimestamps: { taskId: string; time: number }[] = [];
    const startTime = Date.now();

    const meetingWiring = {
      evaluateAndInvite: vi.fn(async () => {}),
      evaluateAndInviteForTask: vi.fn(async (taskInfo: any) => {
        inviteTimestamps.push({ taskId: taskInfo.task_id, time: Date.now() - startTime });
        return [`meeting-${taskInfo.task_id}`];
      }),
      setSpec: vi.fn(),
      clearSession: vi.fn(),
    };

    const taskExecutor = {
      executeTask: vi.fn(async (task: Task) => {
        task.status = 'done';
        return true;
      }),
    };

    const phase = makePhase({
      tasks,
      agents,
      dag,
      meetingWiring,
      meetingBlockResolvers,
      taskExecutor,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const ctx = makeCtx({ abortSignal: controller.signal });

    const runPromise = phase.execute(ctx);

    // Wait for first invite
    await new Promise(r => setTimeout(r, 300));
    expect(inviteTimestamps).toHaveLength(1);

    // Resolve first meeting
    const firstId = inviteTimestamps[0].taskId;
    meetingBlockResolvers.get(`meeting-${firstId}`)!();

    // Wait for second invite (loop poll + re-evaluation)
    await new Promise(r => setTimeout(r, 500));
    expect(inviteTimestamps).toHaveLength(2);

    // The second invite should have come AFTER the first resolved
    expect(inviteTimestamps[1].time).toBeGreaterThan(inviteTimestamps[0].time);

    // Resolve second meeting
    const secondId = inviteTimestamps[1].taskId;
    meetingBlockResolvers.get(`meeting-${secondId}`)!();

    await runPromise;
    clearTimeout(timeoutId);

    // Both tasks should complete
    expect(taskExecutor.executeTask).toHaveBeenCalledTimes(2);
  });

  it('non-design tasks run freely while a meeting is active', async () => {
    // Mix of design and non-design tasks, all independent
    const tasks: Task[] = [
      { id: 't1', name: 'Create sprite art', description: 'Design the character sprite', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't2', name: 'Build logic module', description: 'Implement the core logic', status: 'pending', agent_name: 'Bot' } as Task,
      { id: 't3', name: 'Write tests', description: 'Create unit tests', status: 'pending', agent_name: 'Bot' } as Task,
    ];
    const agents: Agent[] = [
      { name: 'Bot', role: 'builder', status: 'idle' } as Agent,
    ];

    const dag = new TaskDAG();
    dag.addTask('t1', []);
    dag.addTask('t2', []);
    dag.addTask('t3', []);

    const meetingBlockResolvers = new Map<string, () => void>();
    const completedTasks: string[] = [];

    const meetingWiring = {
      evaluateAndInvite: vi.fn(async () => {}),
      evaluateAndInviteForTask: vi.fn(async (taskInfo: any) => {
        return [`meeting-${taskInfo.task_id}`];
      }),
      setSpec: vi.fn(),
      clearSession: vi.fn(),
    };

    const taskExecutor = {
      executeTask: vi.fn(async (task: Task) => {
        task.status = 'done';
        completedTasks.push(task.id);
        return true;
      }),
    };

    const phase = makePhase({
      tasks,
      agents,
      dag,
      meetingWiring,
      meetingBlockResolvers,
      taskExecutor,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const ctx = makeCtx({ abortSignal: controller.signal });

    const runPromise = phase.execute(ctx);

    // Wait for the meeting to trigger and non-design tasks to run
    await new Promise(r => setTimeout(r, 300));

    // Non-design tasks (t2, t3) should have completed even while t1's meeting is active
    expect(completedTasks).toContain('t2');
    expect(completedTasks).toContain('t3');
    // t1 should NOT have completed yet (still meeting-blocked)
    expect(completedTasks).not.toContain('t1');

    // Now resolve the meeting for t1
    const resolver = meetingBlockResolvers.get('meeting-t1');
    expect(resolver).toBeDefined();
    resolver!();

    await runPromise;
    clearTimeout(timeoutId);

    // Now all tasks should be done
    expect(completedTasks).toContain('t1');
    expect(taskExecutor.executeTask).toHaveBeenCalledTimes(3);
  });
});
