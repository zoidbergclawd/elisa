/** Plan phase: decomposes NuggetSpec into a task DAG via MetaPlanner. */

import fs from 'node:fs';
import path from 'node:path';
import type { PhaseContext, SendEvent } from './types.js';
import { maybeTeach } from './types.js';
import { MetaPlanner } from '../metaPlanner.js';
import { TeachingEngine } from '../teachingEngine.js';
import { TaskDAG } from '../../utils/dag.js';
import type { DeviceRegistry } from '../deviceRegistry.js';
import { resolveDeployOrder } from './deployOrder.js';
import type { Task, Agent } from '../../models/session.js';
import type { NuggetSpec } from '../../utils/specValidator.js';
import { estimate as estimateImpact } from '../impactEstimator.js';
import { analyze as analyzeBoundary } from '../boundaryAnalyzer.js';

export interface PlanResult {
  tasks: Task[];
  agents: Agent[];
  taskMap: Record<string, Task>;
  agentMap: Record<string, Agent>;
  dag: TaskDAG;
  nuggetType: string;
}

export class PlanPhase {
  private metaPlanner: MetaPlanner;
  private teachingEngine: TeachingEngine;
  private deviceRegistry?: DeviceRegistry;

  constructor(metaPlanner: MetaPlanner, teachingEngine: TeachingEngine, deviceRegistry?: DeviceRegistry) {
    this.metaPlanner = metaPlanner;
    this.teachingEngine = teachingEngine;
    this.deviceRegistry = deviceRegistry;
  }

  async execute(ctx: PhaseContext, spec: NuggetSpec): Promise<PlanResult> {
    ctx.session.state = 'planning';
    ctx.logger?.phase('planning');
    await ctx.send({ type: 'planning_started' });

    const nuggetType = (ctx.session.spec ?? {}).nugget?.type ?? 'software';

    const plan = await this.metaPlanner.plan(spec);

    const tasks: Task[] = plan.tasks;
    const agents: Agent[] = plan.agents;
    const taskMap: Record<string, Task> = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const agentMap: Record<string, Agent> = Object.fromEntries(agents.map((a) => [a.name, a]));

    for (const task of tasks) task.status ??= 'pending';
    for (const agent of agents) agent.status ??= 'idle';

    const dag = new TaskDAG();
    for (const task of tasks) {
      dag.addTask(task.id, task.dependencies ?? []);
    }

    try {
      dag.getOrder();
    } catch {
      await ctx.send({
        type: 'error',
        message:
          "Oops, some tasks depend on each other in a circle. The plan can't be executed.",
        recoverable: false,
      });
      throw new Error('Circular dependencies in task DAG');
    }

    // Persist DAG to workspace for traceability
    try {
      const dagPath = path.join(ctx.nuggetDir, 'dag.json');
      fs.writeFileSync(dagPath, JSON.stringify(tasks, null, 2), 'utf-8');
    } catch {
      // Best-effort: don't fail the build if dag.json can't be written
    }

    ctx.session.tasks = tasks;
    ctx.session.agents = agents;

    const planExplanation = plan.plan_explanation ?? '';

    // Compute deploy steps from device plugins for frontend visualization
    let deploySteps: Array<{ id: string; name: string; method: string }> | undefined;
    const devices = spec.devices;
    if (Array.isArray(devices) && devices.length > 0 && this.deviceRegistry) {
      const manifests = new Map<string, any>();
      for (const device of devices) {
        const manifest = this.deviceRegistry.getDevice(device.pluginId);
        if (manifest) manifests.set(device.pluginId, manifest);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- manifests Map has local `any` values from heterogeneous device.json schemas
      const ordered = resolveDeployOrder(devices, manifests as any);
      deploySteps = ordered
        .map(d => {
          const m = manifests.get(d.pluginId);
          if (!m) return null;
          return { id: d.pluginId, name: m.name, method: m.deploy.method };
        })
        .filter((s): s is { id: string; name: string; method: string } => s !== null);
    }

    const planReadyEvent: Parameters<typeof ctx.send>[0] = {
      type: 'plan_ready',
      tasks,
      agents,
      explanation: planExplanation,
      deployment_target: spec.deployment?.target ?? '',
      ...(deploySteps ? { deploy_steps: deploySteps } : {}),
    };
    await ctx.send(planReadyEvent);

    await maybeTeach(this.teachingEngine, ctx, 'plan_ready', planExplanation, nuggetType);

    // Emit decomposition_narrated events for each task
    const goal = spec.nugget?.goal ?? 'Build something awesome';
    await ctx.send({
      type: 'decomposition_narrated',
      goal: String(goal),
      subtasks: tasks.map((t: Task) => t.name ?? t.id),
      explanation: planExplanation || `Let me break "${goal}" into pieces so the team can work on it.`,
    });

    // Emit impact_estimate for pre-execution preview
    const impact = estimateImpact(spec);
    await ctx.send({
      type: 'impact_estimate',
      estimated_tasks: impact.estimated_tasks,
      complexity: impact.complexity,
      heaviest_requirements: impact.heaviest_requirements,
      requirement_details: impact.requirement_details,
    });

    // Emit boundary_analysis
    const boundary = analyzeBoundary(spec);
    await ctx.send({
      type: 'boundary_analysis',
      inputs: boundary.inputs,
      outputs: boundary.outputs,
      boundary_portals: boundary.boundary_portals,
    });

    // Add dependency explanations (why_blocked_by) as narrated events
    for (const task of tasks) {
      if (task.dependencies && task.dependencies.length > 0) {
        const depNames = task.dependencies
          .map((depId: string) => taskMap[depId]?.name ?? depId)
          .join(', ');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime augmentation for frontend display; Task type lacks why_blocked_by
        (task as any).why_blocked_by = `"${task.name}" needs ${depNames} to finish first.`;
      }
    }

    if (spec.skills?.length) await maybeTeach(this.teachingEngine, ctx, 'skill_used', '', nuggetType);
    if (spec.rules?.length) await maybeTeach(this.teachingEngine, ctx, 'rule_used', '', nuggetType);
    if (spec.portals?.length) await maybeTeach(this.teachingEngine, ctx, 'portal_used', '', nuggetType);

    return { tasks, agents, taskMap, agentMap, dag, nuggetType };
  }
}
