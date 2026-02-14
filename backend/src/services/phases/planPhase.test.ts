/** Unit tests for PlanPhase. */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PlanPhase } from './planPhase.js';
import type { PhaseContext } from './types.js';
import { MetaPlanner } from '../metaPlanner.js';
import { TeachingEngine } from '../teachingEngine.js';
import { TaskDAG } from '../../utils/dag.js';

vi.mock('../metaPlanner.js');
vi.mock('../teachingEngine.js');

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: { id: 'test', state: 'idle', spec: { nugget: { type: 'software' } }, tasks: [], agents: [] } as any,
    send: vi.fn().mockResolvedValue(undefined),
    logger: { phase: vi.fn() } as any,
    nuggetDir: '',
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

const SIMPLE_PLAN = {
  tasks: [
    { id: 'task-1', name: 'Build UI', dependencies: [] },
    { id: 'task-2', name: 'Add CSS', dependencies: ['task-1'] },
  ],
  agents: [
    { name: 'Builder Bot', role: 'builder' },
  ],
  plan_explanation: 'Build then style.',
};

describe('PlanPhase', () => {
  let metaPlanner: MetaPlanner;
  let teachingEngine: TeachingEngine;
  let tmpDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    metaPlanner = new MetaPlanner();
    teachingEngine = new TeachingEngine();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planphase-test-'));
    vi.mocked(metaPlanner.plan).mockResolvedValue(SIMPLE_PLAN);
    vi.mocked(teachingEngine.getMoment).mockResolvedValue(null);
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('calls metaPlanner.plan() and builds DAG from returned tasks', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);
    const spec = { nugget: { type: 'software' } };

    const result = await phase.execute(ctx, spec);

    expect(metaPlanner.plan).toHaveBeenCalledWith(spec);
    expect(result.dag).toBeInstanceOf(TaskDAG);
    expect(result.tasks).toHaveLength(2);
    expect(result.agents).toHaveLength(1);
    expect(result.taskMap['task-1'].name).toBe('Build UI');
    expect(result.agentMap['Builder Bot'].role).toBe('builder');
  });

  it('sends planning_started then plan_ready events in order', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);

    await phase.execute(ctx, {});

    const calls = vi.mocked(ctx.send).mock.calls.map(([ev]) => ev.type);
    const planningIdx = calls.indexOf('planning_started');
    const readyIdx = calls.indexOf('plan_ready');
    expect(planningIdx).toBeGreaterThanOrEqual(0);
    expect(readyIdx).toBeGreaterThan(planningIdx);
  });

  it('handles circular deps: sends error event and throws', async () => {
    const circularPlan = {
      tasks: [
        { id: 'a', name: 'A', dependencies: ['b'] },
        { id: 'b', name: 'B', dependencies: ['a'] },
      ],
      agents: [],
      plan_explanation: '',
    };
    vi.mocked(metaPlanner.plan).mockResolvedValue(circularPlan);

    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);

    await expect(phase.execute(ctx, {})).rejects.toThrow('Circular dependencies');

    const errorEvent = vi.mocked(ctx.send).mock.calls.find(([ev]) => ev.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent![0].recoverable).toBe(false);
  });

  it('writes dag.json to nuggetDir', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);

    await phase.execute(ctx, {});

    const dagPath = path.join(tmpDir, 'dag.json');
    expect(fs.existsSync(dagPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(dagPath, 'utf-8'));
    expect(written).toHaveLength(2);
    expect(written[0].id).toBe('task-1');
  });

  it('sets session.state to planning', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);

    await phase.execute(ctx, {});

    expect(ctx.session.state).toBe('planning');
  });

  it('defaults task status to pending and agent status to idle', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);

    const result = await phase.execute(ctx, {});

    for (const task of result.tasks) {
      expect(task.status).toBe('pending');
    }
    for (const agent of result.agents) {
      expect(agent.status).toBe('idle');
    }
  });

  it('includes plan_explanation and deployment_target in plan_ready event', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);
    const spec = { deployment: { target: 'esp32' } };

    await phase.execute(ctx, spec);

    const planReady = vi.mocked(ctx.send).mock.calls.find(([ev]) => ev.type === 'plan_ready');
    expect(planReady).toBeDefined();
    expect(planReady![0].explanation).toBe('Build then style.');
    expect(planReady![0].deployment_target).toBe('esp32');
  });
});
