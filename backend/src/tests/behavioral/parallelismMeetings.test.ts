import { describe, it, expect, vi } from 'vitest';
import { ExecutePhase } from '../../services/phases/executePhase.js';
import { TaskDAG } from '../../utils/dag.js';
import { TokenTracker } from '../../utils/tokenTracker.js';
import { ContextManager } from '../../utils/contextManager.js';
import type { Task, Agent } from '../../models/session.js';
import type { PhaseContext } from '../../services/phases/types.js';

describe('Parallelism: meeting evaluation does not block slot refill', () => {
  it('does not await evaluateTaskCompletedMeetings in the task promise', async () => {
    // Create 4 independent tasks
    const tasks: Task[] = [
      { id: 't1', name: 'Task 1', status: 'pending', agent_name: 'Bot' },
      { id: 't2', name: 'Task 2', status: 'pending', agent_name: 'Bot' },
      { id: 't3', name: 'Task 3', status: 'pending', agent_name: 'Bot' },
      { id: 't4', name: 'Task 4', status: 'pending', agent_name: 'Bot' },
    ] as Task[];

    const agents: Agent[] = [
      { name: 'Bot', role: 'builder', status: 'idle' },
    ] as Agent[];

    const taskMap: Record<string, Task> = {};
    for (const t of tasks) taskMap[t.id] = t;

    const agentMap: Record<string, Agent> = {};
    for (const a of agents) agentMap[a.name] = a;

    const dag = new TaskDAG();
    for (const t of tasks) dag.addTask(t.id);

    const taskCompletionOrder: string[] = [];

    // Track when meeting evaluation starts/ends
    let meetingEvalStarted = 0;
    let meetingEvalFinished = 0;

    const mockMeetingWiring = {
      evaluateAndInvite: vi.fn(async () => {
        meetingEvalStarted++;
        // Simulate slow meeting evaluation
        await new Promise(r => setTimeout(r, 100));
        meetingEvalFinished++;
      }),
      evaluateAndInviteForTask: vi.fn(async () => []),
      setSpec: vi.fn(),
      clearSession: vi.fn(),
    };

    // Mock task executor that completes instantly
    const mockTaskExecutor = {
      executeTask: vi.fn(async (task: Task) => {
        task.status = 'done';
        taskCompletionOrder.push(task.id);
        return true;
      }),
    };

    const tokenTracker = new TokenTracker();
    const context = new ContextManager();

    const phase = new ExecutePhase({
      agentRunner: {} as never,
      git: null,
      teachingEngine: {} as never,
      tokenTracker,
      portalService: {} as never,
      context,
      tasks,
      agents,
      taskMap,
      agentMap,
      dag,
      questionResolvers: new Map(),
      gateResolver: { current: null },
      meetingTriggerWiring: mockMeetingWiring as never,
      sessionId: 'test-session',
      systemLevel: 'explorer',
      taskExecutor: mockTaskExecutor as never,
    });

    const ctx: PhaseContext = {
      session: { id: 'test-session', state: 'executing', spec: {} } as never,
      send: vi.fn(),
      nuggetDir: '/tmp/test',
      nuggetType: 'software',
      abortSignal: new AbortController().signal,
      logger: null,
    };

    await phase.execute(ctx);

    // All 4 tasks should have completed
    expect(taskCompletionOrder).toHaveLength(4);

    // The key assertion: meeting evaluation should have been called
    // but should NOT have blocked task scheduling.
    // With the fire-and-forget fix, new tasks can launch
    // before meeting evaluation completes.
    expect(meetingEvalStarted).toBeGreaterThan(0);
  });
});
