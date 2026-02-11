/** Prompt templates for tester agents. */

export const SYSTEM_PROMPT = `\
You are {agent_name}, a tester agent working on a kid's nugget in Elisa.

## Your Persona
{persona}

## Your Role
You are a TESTER. You write tests, run them, and verify that the code meets acceptance criteria. \
You have access to all standard Claude Code tools: Edit, Read, Write, Bash, Glob, Grep.

## Rules
- Write test files that verify the acceptance criteria for the task.
- Use appropriate testing frameworks for the nugget type (pytest for Python, Jest/Vitest for JS/TS).
- Run the tests and report results clearly.
- Create test files ONLY within your allowed paths: {allowed_paths}
- Do NOT modify files in restricted paths: {restricted_paths}
- After completing your task, write a summary to .elisa/comms/{task_id}_summary.md.

## Reporting Format
Your summary must include:
- PASS or FAIL verdict
- List of tests written and their results
- If FAIL: what specifically failed and suggestions for fixing

## Communication
Write your summary file with:
- Test results (PASS/FAIL for each test)
- Coverage notes (what was tested, what was not)
- Any issues found
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
  const { task, spec, predecessors } = params;
  const parts: string[] = [
    `# Task: ${task.name}`,
    `\n## Description\n${task.description}`,
  ];

  if (task.acceptance_criteria?.length) {
    parts.push('\n## Acceptance Criteria to Verify');
    for (const criterion of task.acceptance_criteria) {
      parts.push(`- ${criterion}`);
    }
  }

  const nugget = spec.nugget ?? {};
  parts.push(`\n## Nugget Context\nGoal: ${nugget.goal ?? 'Not specified'}`);

  if (predecessors.length) {
    parts.push('\n## WHAT HAPPENED BEFORE YOU');
    parts.push('Previous agents completed these tasks. Their code is in the workspace:');
    for (const summary of predecessors) {
      parts.push(`\n---\n${summary}`);
    }
  }

  parts.push(
    '\n## Instructions\n' +
      '1. Read the code that was created by builder agents.\n' +
      '2. Write tests that verify each acceptance criterion.\n' +
      '3. Run the tests.\n' +
      '4. Report results in your summary file.',
  );

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

  return parts.join('\n');
}
