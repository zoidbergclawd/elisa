/** Decomposes a nugget spec into a task DAG using Claude. */

import Anthropic from '@anthropic-ai/sdk';
import { META_PLANNER_SYSTEM, metaPlannerUser } from '../prompts/metaPlanner.js';

const DEFAULT_AGENTS = [
  {
    name: 'Builder Bot',
    role: 'builder',
    persona: 'A friendly robot who loves building things and explaining how they work.',
  },
  {
    name: 'Test Bot',
    role: 'tester',
    persona: 'A careful detective who checks everything twice to make sure it works.',
  },
  {
    name: 'Review Bot',
    role: 'reviewer',
    persona: 'A helpful teacher who looks at code and suggests ways to make it even better.',
  },
];

export class MetaPlanner {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  async plan(spec: Record<string, any>): Promise<Record<string, any>> {
    if (!spec.agents) {
      spec = { ...spec, agents: DEFAULT_AGENTS };
    }

    const specJson = JSON.stringify(spec, null, 2);
    const userMsg = metaPlannerUser(specJson);

    const response = await this.client.messages.create({
      model: 'claude-opus-4-6',
      system: META_PLANNER_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      max_tokens: 4096,
    });

    const text = this.extractText(response);
    let plan = this.parseJson(text);

    if (!plan) {
      plan = await this.retryParse(userMsg, text);
    }

    this.validate(plan);
    return plan;
  }

  private async retryParse(
    originalUserMsg: string,
    badResponse: string,
  ): Promise<Record<string, any>> {
    const response = await this.client.messages.create({
      model: 'claude-opus-4-6',
      system: META_PLANNER_SYSTEM,
      messages: [
        { role: 'user', content: originalUserMsg },
        { role: 'assistant', content: badResponse },
        {
          role: 'user',
          content:
            'Your response was not valid JSON. ' +
            'Please output ONLY the JSON object with no markdown code fences ' +
            'or commentary. Just the raw JSON.',
        },
      ],
      max_tokens: 4096,
    });

    const text = this.extractText(response);
    const plan = this.parseJson(text);
    if (!plan) {
      throw new Error('Meta-planner failed to produce valid JSON after retry');
    }
    return plan;
  }

  private extractText(response: Anthropic.Message): string {
    for (const block of response.content) {
      if (block.type === 'text') return block.text;
    }
    throw new Error('No text content in meta-planner response');
  }

  private parseJson(text: string): Record<string, any> | null {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?(.*?)```/s);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  private validate(plan: Record<string, any>): void {
    if (typeof plan !== 'object' || plan === null) {
      throw new Error('Plan must be a JSON object');
    }
    if (!('tasks' in plan)) {
      throw new Error("Plan must contain 'tasks' key");
    }
    if (!('agents' in plan)) {
      throw new Error("Plan must contain 'agents' key");
    }
    if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
      throw new Error('Plan must have at least one task');
    }

    const taskIds = new Set(plan.tasks.map((t: any) => t.id));
    const agentNames = new Set(plan.agents.map((a: any) => a.name));

    for (const task of plan.tasks) {
      if (!task.id) throw new Error(`Task missing 'id': ${JSON.stringify(task)}`);
      if (!task.dependencies) throw new Error(`Task missing 'dependencies': ${task.id}`);
      for (const dep of task.dependencies) {
        if (!taskIds.has(dep)) {
          throw new Error(`Task ${task.id} depends on unknown task ${dep}`);
        }
      }
      if (task.agent_name && !agentNames.has(task.agent_name)) {
        throw new Error(`Task ${task.id} assigned to unknown agent ${task.agent_name}`);
      }
    }
  }
}
