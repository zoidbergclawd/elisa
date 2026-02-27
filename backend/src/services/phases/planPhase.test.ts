/** Unit tests for PlanPhase. */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PlanPhase } from './planPhase.js';
import type { PhaseContext, WSEvent } from './types.js';
import { MetaPlanner } from '../metaPlanner.js';
import { TeachingEngine } from '../teachingEngine.js';
import { TaskDAG } from '../../utils/dag.js';
import type { DeviceRegistry } from '../deviceRegistry.js';
import type { SpecGraphService } from '../specGraph.js';
import type { MetaPlannerPlan } from '../../models/session.js';

vi.mock('../metaPlanner.js');
vi.mock('../teachingEngine.js');

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: { id: 'test', state: 'idle', spec: { nugget: { type: 'software' } }, tasks: [], agents: [] } as any,
    send: vi.fn().mockResolvedValue(undefined) as any,
    logger: { phase: vi.fn() } as any,
    nuggetDir: '',
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

const SIMPLE_PLAN: MetaPlannerPlan = {
  tasks: [
    { id: 'task-1', name: 'Build UI', description: '', status: 'pending', agent_name: 'Builder Bot', dependencies: [], acceptance_criteria: [] },
    { id: 'task-2', name: 'Add CSS', description: '', status: 'pending', agent_name: 'Builder Bot', dependencies: ['task-1'], acceptance_criteria: [] },
  ],
  agents: [
    { name: 'Builder Bot', role: 'builder', persona: '', status: 'idle' },
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

    expect(metaPlanner.plan).toHaveBeenCalledWith(spec, undefined);
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
    const circularPlan: MetaPlannerPlan = {
      tasks: [
        { id: 'a', name: 'A', description: '', status: 'pending', agent_name: '', dependencies: ['b'], acceptance_criteria: [] },
        { id: 'b', name: 'B', description: '', status: 'pending', agent_name: '', dependencies: ['a'], acceptance_criteria: [] },
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
    const errEvt = errorEvent![0] as Extract<WSEvent, { type: 'error' }>;
    expect(errEvt.recoverable).toBe(false);
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
    const evt = planReady![0] as Extract<WSEvent, { type: 'plan_ready' }>;
    expect(evt.explanation).toBe('Build then style.');
    expect(evt.deployment_target).toBe('esp32');
  });

  it('includes deploy_steps in plan_ready when spec has devices', async () => {
    const mockRegistry = {
      getDevice: vi.fn((id: string) => {
        if (id === 'cloud-dashboard') {
          return { id: 'cloud-dashboard', name: 'Cloud Dashboard', deploy: { method: 'cloud', provides: ['DASHBOARD_URL'], requires: [] } };
        }
        if (id === 'heltec-sensor') {
          return { id: 'heltec-sensor', name: 'Heltec Sensor Node', deploy: { method: 'flash', provides: [], requires: ['DASHBOARD_URL'] } };
        }
        return undefined;
      }),
    } as unknown as DeviceRegistry;

    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine, mockRegistry);
    const spec = {
      devices: [
        { pluginId: 'heltec-sensor', instanceId: 'sensor-1', fields: {} },
        { pluginId: 'cloud-dashboard', instanceId: 'dash-1', fields: {} },
      ],
    };

    await phase.execute(ctx, spec);

    const planReady = vi.mocked(ctx.send).mock.calls.find(([ev]) => ev.type === 'plan_ready');
    const evt = planReady![0] as Extract<WSEvent, { type: 'plan_ready' }>;
    expect(evt.deploy_steps).toBeDefined();
    const steps = evt.deploy_steps!;
    expect(steps).toHaveLength(2);
    // Cloud first (provides DASHBOARD_URL), then sensor (requires it)
    expect(steps[0].id).toBe('cloud-dashboard');
    expect(steps[0].method).toBe('cloud');
    expect(steps[1].id).toBe('heltec-sensor');
    expect(steps[1].method).toBe('flash');
  });

  it('omits deploy_steps when no devices in spec', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);

    await phase.execute(ctx, {});

    const planReady = vi.mocked(ctx.send).mock.calls.find(([ev]) => ev.type === 'plan_ready');
    const evt = planReady![0] as Extract<WSEvent, { type: 'plan_ready' }>;
    expect(evt.deploy_steps).toBeUndefined();
  });

  // --- Spec Graph context integration ---

  it('passes graph context to metaPlanner when spec has composition.parent_graph_id', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const graphContext = '## Spec Graph Context\n\n### Existing Nuggets (1)\n- **Weather App**: Build a weather app';

    const mockGraphService = {
      buildGraphContext: vi.fn().mockReturnValue(graphContext),
    } as unknown as SpecGraphService;

    const phase = new PlanPhase(metaPlanner, teachingEngine, undefined, mockGraphService);
    const spec = {
      nugget: { type: 'software' },
      composition: { parent_graph_id: 'graph-123', node_id: 'node-456' },
    };

    await phase.execute(ctx, spec);

    expect(mockGraphService.buildGraphContext).toHaveBeenCalledWith('graph-123', 'node-456');
    expect(metaPlanner.plan).toHaveBeenCalledWith(spec, graphContext);
  });

  it('calls metaPlanner.plan without graphContext when spec has no composition', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const mockGraphService = {
      buildGraphContext: vi.fn(),
    } as unknown as SpecGraphService;

    const phase = new PlanPhase(metaPlanner, teachingEngine, undefined, mockGraphService);
    const spec = { nugget: { type: 'software' } };

    await phase.execute(ctx, spec);

    expect(mockGraphService.buildGraphContext).not.toHaveBeenCalled();
    expect(metaPlanner.plan).toHaveBeenCalledWith(spec, undefined);
  });

  it('calls metaPlanner.plan without graphContext when no specGraphService is provided', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const phase = new PlanPhase(metaPlanner, teachingEngine);
    const spec = {
      nugget: { type: 'software' },
      composition: { parent_graph_id: 'graph-123' },
    };

    await phase.execute(ctx, spec);

    expect(metaPlanner.plan).toHaveBeenCalledWith(spec, undefined);
  });

  it('gracefully handles buildGraphContext throwing (graph not found)', async () => {
    const ctx = makeCtx({ nuggetDir: tmpDir });
    const mockGraphService = {
      buildGraphContext: vi.fn().mockImplementation(() => { throw new Error('Graph not found: bad-id'); }),
    } as unknown as SpecGraphService;

    const phase = new PlanPhase(metaPlanner, teachingEngine, undefined, mockGraphService);
    const spec = {
      nugget: { type: 'software' },
      composition: { parent_graph_id: 'bad-id' },
    };

    await phase.execute(ctx, spec);

    // Should still call plan, just without graph context
    expect(metaPlanner.plan).toHaveBeenCalledWith(spec, undefined);
  });
});
