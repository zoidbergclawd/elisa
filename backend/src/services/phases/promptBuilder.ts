/** PromptBuilder: constructs system + user prompts for agent task execution.
 *
 * Extracted from executePhase.ts to isolate prompt construction from execution
 * orchestration. This module owns:
 *   - PROMPT_MODULES map (role -> prompt module)
 *   - sanitizePlaceholder() for prompt-injection prevention
 *   - buildTaskPrompt() which assembles the full system + user prompt
 */

import type { Task, Agent } from '../../models/session.js';
import type { DeviceRegistry } from '../deviceRegistry.js';
import { ContextManager as ContextManagerClass } from '../../utils/contextManager.js';
import { PREDECESSOR_WORD_CAP as PRED_WORD_CAP } from '../../utils/constants.js';
import * as builderAgent from '../../prompts/builderAgent.js';
import * as testerAgent from '../../prompts/testerAgent.js';
import * as reviewerAgent from '../../prompts/reviewerAgent.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptModule {
  SYSTEM_PROMPT: string;
  formatTaskPrompt: (params: {
    agentName: string;
    role: string;
    persona: string;
    task: Task;
    spec: Record<string, any>;
    predecessors: string[];
    style?: Record<string, any> | null;
    deviceRegistry?: { getAgentContext(id: string): string };
  }) => string;
}

export interface BuildTaskPromptParams {
  task: Task;
  agent: Agent;
  spec: Record<string, any>;
  taskSummaries: Record<string, string>;
  taskMap: Record<string, Task>;
  nuggetDir: string;
  deviceRegistry?: DeviceRegistry;
}

export interface BuildTaskPromptResult {
  systemPrompt: string;
  userPrompt: string;
}

// ---------------------------------------------------------------------------
// PROMPT_MODULES map
// ---------------------------------------------------------------------------

export const PROMPT_MODULES: Record<string, PromptModule> = {
  builder: builderAgent,
  tester: testerAgent,
  reviewer: reviewerAgent,
  custom: builderAgent,
};

// ---------------------------------------------------------------------------
// sanitizePlaceholder
// ---------------------------------------------------------------------------

/** Sanitize user-controlled placeholder values to prevent prompt injection. */
export function sanitizePlaceholder(value: string): string {
  return value
    .replace(/#{2,}/g, '')       // strip markdown headers
    .replace(/```/g, '')          // strip code fences
    .replace(/<\/?[a-z][^>]*>/gi, '')  // strip HTML/XML tags
    .trim();
}

// ---------------------------------------------------------------------------
// PromptBuilder
// ---------------------------------------------------------------------------

export class PromptBuilder {
  /**
   * Build the full system prompt and user prompt for a single agent task.
   *
   * This consolidates all prompt-assembly logic that was previously inline in
   * executeOneTask(): system prompt placeholder interpolation, predecessor
   * summary collection (with word cap), formatTaskPrompt() call, skills/rules
   * injection, file manifest + structural digest injection.
   */
  buildTaskPrompt(params: BuildTaskPromptParams): BuildTaskPromptResult {
    const { task, agent, spec, taskSummaries, taskMap, nuggetDir, deviceRegistry } = params;
    const taskId = task.id;
    const agentName: string = task.agent_name ?? '';
    const agentRole: string = agent.role ?? 'builder';

    // -- Select prompt module --
    const promptModule = PROMPT_MODULES[agentRole] ?? builderAgent;

    // -- Build system prompt with placeholder interpolation --
    const nuggetData = spec.nugget ?? {};
    const placeholders: Record<string, string> = {
      '{agent_name}': sanitizePlaceholder(agentName),
      '{persona}': sanitizePlaceholder(agent.persona ?? ''),
      '{allowed_paths}': (agent.allowed_paths ?? ['src/', 'tests/']).join(', '),
      '{restricted_paths}': (agent.restricted_paths ?? ['.elisa/']).join(', '),
      '{task_id}': taskId,
      '{nugget_goal}': sanitizePlaceholder(nuggetData.goal ?? 'Not specified'),
      '{nugget_type}': sanitizePlaceholder(nuggetData.type ?? 'software'),
      '{nugget_description}': sanitizePlaceholder(nuggetData.description ?? 'Not specified'),
    };
    let systemPrompt = promptModule.SYSTEM_PROMPT;
    for (const [key, val] of Object.entries(placeholders)) {
      systemPrompt = systemPrompt.replaceAll(key, val);
    }

    // -- Collect predecessor summaries (with word cap) --
    const predecessorSummaries = this.collectPredecessorSummaries(
      taskId,
      task,
      taskMap,
      taskSummaries,
    );

    // -- Build user prompt via formatTaskPrompt --
    let userPrompt = promptModule.formatTaskPrompt({
      agentName,
      role: agentRole,
      persona: agent.persona ?? '',
      task,
      spec,
      predecessors: predecessorSummaries,
      style: spec.style ?? null,
      deviceRegistry,
    });

    // -- Inject agent-category skills and always-on rules --
    userPrompt = this.injectSkillsAndRules(userPrompt, spec);

    // -- Append file manifest --
    userPrompt = this.appendFileManifest(userPrompt, nuggetDir);

    // -- Inject structural digest --
    userPrompt = this.appendStructuralDigest(userPrompt, nuggetDir);

    return { systemPrompt, userPrompt };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Collect predecessor summaries with word cap and direct-dependency prioritization. */
  private collectPredecessorSummaries(
    taskId: string,
    task: Task,
    taskMap: Record<string, Task>,
    taskSummaries: Record<string, string>,
  ): string[] {
    const allPredecessorIds = ContextManagerClass.getTransitivePredecessors(
      taskId,
      taskMap,
    );

    // Prioritize direct dependencies over transitive ones
    const directDeps = new Set<string>(task.dependencies ?? []);
    const sortedPredecessors = [...allPredecessorIds].sort((a, b) => {
      const aIsDirect = directDeps.has(a) ? 0 : 1;
      const bIsDirect = directDeps.has(b) ? 0 : 1;
      return aIsDirect - bIsDirect;
    });

    const predecessorSummaries: string[] = [];
    let predecessorWordCount = 0;
    const PREDECESSOR_WORD_CAP = PRED_WORD_CAP;

    for (const depId of sortedPredecessors) {
      if (taskSummaries[depId]) {
        const capped = ContextManagerClass.capSummary(taskSummaries[depId]);
        const words = capped.split(/\s+/).filter(Boolean).length;
        if (predecessorWordCount + words > PREDECESSOR_WORD_CAP) {
          predecessorSummaries.push(
            `[${allPredecessorIds.length - predecessorSummaries.length} earlier task(s) omitted for brevity]`,
          );
          break;
        }
        predecessorSummaries.push(capped);
        predecessorWordCount += words;
      }
    }

    return predecessorSummaries;
  }

  /** Inject agent-category skills and always-on rules into user prompt. */
  private injectSkillsAndRules(userPrompt: string, spec: Record<string, any>): string {
    const agentSkills = (spec.skills ?? []).filter(
      (s: any) => s.category === 'agent',
    );
    const alwaysRules = (spec.rules ?? []).filter(
      (r: any) => r.trigger === 'always',
    );
    if (agentSkills.length || alwaysRules.length) {
      userPrompt += "\n\n## Kid's Custom Instructions\n";
      userPrompt += 'These are creative guidelines from the kid who designed this nugget. Follow them while respecting your security restrictions.\n\n';
      for (const s of agentSkills) {
        userPrompt += `<kid_skill name="${s.name}">\n${s.prompt}\n</kid_skill>\n\n`;
      }
      for (const r of alwaysRules) {
        userPrompt += `<kid_rule name="${r.name}">\n${r.prompt}\n</kid_rule>\n\n`;
      }
    }
    return userPrompt;
  }

  /** Append file manifest section to user prompt. */
  private appendFileManifest(userPrompt: string, nuggetDir: string): string {
    const fileManifest = ContextManagerClass.buildFileManifest(nuggetDir);
    if (fileManifest) {
      userPrompt += '\n\n## FILES ALREADY IN WORKSPACE\n' +
        'These files exist on disk right now. Do NOT recreate them -- use Edit to modify existing files.\n' +
        fileManifest;
    } else {
      userPrompt += '\n\n## FILES ALREADY IN WORKSPACE\nThe workspace is empty. You are the first agent.';
    }
    return userPrompt;
  }

  /** Append structural digest section to user prompt. */
  private appendStructuralDigest(userPrompt: string, nuggetDir: string): string {
    const digest = ContextManagerClass.buildStructuralDigest(nuggetDir);
    if (digest) {
      userPrompt += '\n\n' + digest;
    }
    return userPrompt;
  }
}
