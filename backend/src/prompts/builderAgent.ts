/** Prompt templates for builder agents. */

export const SYSTEM_PROMPT = `\
You are {agent_name}, a builder agent working on a kid's nugget in Elisa.

## Your Persona
{persona}

## Your Role
You are a BUILDER. You write code, create files, and implement features. You have access to \
all standard Claude Code tools: Edit, Read, Write, Bash, Glob, Grep.

## Rules
- Write clean, well-structured code appropriate for the nugget type.
- Follow the nugget's style preferences (colors, theme, tone).
- Create files ONLY within your allowed paths: {allowed_paths}
- Do NOT modify files in restricted paths: {restricted_paths}
- Keep code simple and readable -- a kid should be able to follow along.
- After completing your task, write a brief summary of what you did to \
.elisa/comms/{task_id}_summary.md (2-3 sentences max).

## Communication
When you finish, your summary file should contain:
- What files you created or modified
- What the code does in simple terms
- Any issues or notes for the next agent
`;

export function formatTaskPrompt(params: {
  agentName: string;
  role: string;
  persona: string;
  task: Record<string, any>;
  spec: Record<string, any>;
  predecessors: string[];
  style?: Record<string, any> | null;
}): string {
  const { agentName, role, persona, task, spec, predecessors, style } = params;
  const parts: string[] = [
    `# Task: ${task.name}`,
    `\n## Description\n${task.description}`,
  ];

  if (task.acceptance_criteria?.length) {
    parts.push('\n## Acceptance Criteria');
    for (const criterion of task.acceptance_criteria) {
      parts.push(`- ${criterion}`);
    }
  }

  const nugget = spec.nugget ?? {};
  parts.push(`\n## Nugget Context\nGoal: ${nugget.goal ?? 'Not specified'}`);
  if (nugget.description) {
    parts.push(`Description: ${nugget.description}`);
  }

  const requirements = spec.requirements ?? [];
  if (requirements.length) {
    parts.push('\n## Nugget Requirements');
    for (const req of requirements) {
      parts.push(`- [${req.type ?? 'feature'}] ${req.description ?? ''}`);
    }
  }

  if (style) {
    parts.push(`\n## Style Preferences\n${formatStyle(style)}`);
  }

  if (predecessors.length) {
    parts.push('\n## WHAT HAPPENED BEFORE YOU');
    parts.push('Previous agents completed these tasks. Use their output as context:');
    for (const summary of predecessors) {
      parts.push(`\n---\n${summary}`);
    }
  }

  const deployment = spec.deployment ?? {};
  if (deployment.target) {
    parts.push(`\n## Deployment Target: ${deployment.target}`);
  }

  const featureSkills = (spec.skills ?? []).filter(
    (s: any) => s.category === 'feature',
  );
  if (featureSkills.length) {
    parts.push("\n## Detailed Feature Instructions (kid's skills)");
    for (const s of featureSkills) {
      parts.push(`### ${s.name}\n${s.prompt}`);
    }
  }

  const styleSkills = (spec.skills ?? []).filter(
    (s: any) => s.category === 'style',
  );
  if (styleSkills.length) {
    parts.push("\n## Detailed Style Instructions (kid's skills)");
    for (const s of styleSkills) {
      parts.push(`### ${s.name}\n${s.prompt}`);
    }
  }

  const onCompleteRules = (spec.rules ?? []).filter(
    (r: any) => r.trigger === 'on_task_complete',
  );
  if (onCompleteRules.length) {
    parts.push("\n## Validation Rules (kid's rules)");
    for (const r of onCompleteRules) {
      parts.push(`### ${r.name}\n${r.prompt}`);
    }
  }

  // Portal context
  const portals = spec.portals ?? [];
  if (portals.length) {
    parts.push('\n## Available Portals');
    for (const portal of portals) {
      parts.push(`### Portal: ${portal.name}`);
      parts.push(`Description: ${portal.description}`);
      parts.push(`Mechanism: ${portal.mechanism}`);
      if (portal.capabilities?.length) {
        parts.push('Capabilities:');
        for (const cap of portal.capabilities) {
          parts.push(`  - [${cap.kind}] ${cap.name}: ${cap.description}`);
        }
      }
      if (portal.interactions?.length) {
        parts.push('Requested interactions:');
        for (const interaction of portal.interactions) {
          parts.push(`  - ${interaction.type}: ${interaction.capabilityId}`);
        }
      }
    }
  }

  return parts.join('\n');
}

function formatStyle(style: Record<string, any>): string {
  const parts: string[] = [];
  if (style.colors) parts.push(`Colors: ${style.colors}`);
  if (style.theme) parts.push(`Theme: ${style.theme}`);
  if (style.tone) parts.push(`Tone: ${style.tone}`);
  return parts.length ? parts.join('\n') : 'No specific style preferences.';
}
