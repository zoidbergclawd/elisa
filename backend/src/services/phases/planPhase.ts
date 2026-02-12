/** Plan phase: decomposes NuggetSpec into a task DAG via MetaPlanner. */

import type { PhaseContext, SendEvent } from './types.js';
import { MetaPlanner } from '../metaPlanner.js';
import { TeachingEngine } from '../teachingEngine.js';
import { TaskDAG } from '../../utils/dag.js';

export interface PlanResult {
  tasks: Record<string, any>[];
  agents: Record<string, any>[];
  taskMap: Record<string, Record<string, any>>;
  agentMap: Record<string, Record<string, any>>;
  dag: TaskDAG;
  nuggetType: string;
}

export class PlanPhase {
  private metaPlanner: MetaPlanner;
  private teachingEngine: TeachingEngine;

  constructor(metaPlanner: MetaPlanner, teachingEngine: TeachingEngine) {
    this.metaPlanner = metaPlanner;
    this.teachingEngine = teachingEngine;
  }

  async execute(ctx: PhaseContext, spec: Record<string, any>): Promise<PlanResult> {
    ctx.session.state = 'planning';
    ctx.logger?.phase('planning');
    await ctx.send({ type: 'planning_started' });

    const nuggetType = (ctx.session.spec ?? {}).nugget?.type ?? 'software';

    const plan = await this.metaPlanner.plan(spec);

    const tasks = plan.tasks;
    const agents = plan.agents;
    const taskMap = Object.fromEntries(tasks.map((t: any) => [t.id, t]));
    const agentMap = Object.fromEntries(agents.map((a: any) => [a.name, a]));

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

    ctx.session.tasks = tasks;
    ctx.session.agents = agents;

    const planExplanation = plan.plan_explanation ?? '';

    await ctx.send({
      type: 'plan_ready',
      tasks,
      agents,
      explanation: planExplanation,
    });

    await this.maybeTeach(ctx, 'plan_ready', planExplanation, nuggetType);

    if (spec.skills?.length) await this.maybeTeach(ctx, 'skill_used', '', nuggetType);
    if (spec.rules?.length) await this.maybeTeach(ctx, 'rule_used', '', nuggetType);
    if (spec.portals?.length) await this.maybeTeach(ctx, 'portal_used', '', nuggetType);

    return { tasks, agents, taskMap, agentMap, dag, nuggetType };
  }

  private async maybeTeach(
    ctx: PhaseContext,
    eventType: string,
    eventDetails: string,
    nuggetType: string,
  ): Promise<void> {
    const moment = await this.teachingEngine.getMoment(eventType, eventDetails, nuggetType);
    if (moment) {
      await ctx.send({ type: 'teaching_moment', ...moment });
    }
  }
}
