import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, formatTaskPrompt } from './reviewerAgent.js';

describe('reviewerAgent SYSTEM_PROMPT', () => {
  it('contains all required placeholders', () => {
    for (const ph of [
      '{agent_name}',
      '{nugget_goal}',
      '{nugget_type}',
      '{nugget_description}',
      '{persona}',
      '{allowed_paths}',
      '{restricted_paths}',
      '{task_id}',
    ]) {
      expect(SYSTEM_PROMPT).toContain(ph);
    }
  });

  it('contains team briefing section', () => {
    expect(SYSTEM_PROMPT).toContain('Team Briefing');
    expect(SYSTEM_PROMPT).toContain('multi-agent team');
  });

  it('defines reviewer role', () => {
    expect(SYSTEM_PROMPT).toContain('REVIEWER');
  });

  it('contains review checklist', () => {
    expect(SYSTEM_PROMPT).toContain('Review Checklist');
    expect(SYSTEM_PROMPT).toContain('acceptance criteria');
  });

  it('contains reporting format with verdict', () => {
    expect(SYSTEM_PROMPT).toContain('APPROVED');
    expect(SYSTEM_PROMPT).toContain('NEEDS_CHANGES');
  });

  it('contains security restrictions', () => {
    expect(SYSTEM_PROMPT).toContain('Security Restrictions');
    expect(SYSTEM_PROMPT).toContain('kid_skill');
    expect(SYSTEM_PROMPT).toContain('kid_rule');
    expect(SYSTEM_PROMPT).toContain('user_input');
  });
});

describe('reviewerAgent formatTaskPrompt', () => {
  const baseParams = {
    agentName: 'Review Bot',
    role: 'reviewer',
    persona: 'A helpful teacher',
    task: {
      name: 'Review code',
      description: 'Review all builder code',
      acceptance_criteria: ['Code quality acceptable', 'No bugs found'],
    },
    spec: {
      nugget: { goal: 'A todo app', type: 'software' },
      deployment: { target: 'preview' },
    },
    predecessors: [],
  };

  it('includes task name and description', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('# Task: Review code');
    expect(result).toContain('Review all builder code');
  });

  it('includes acceptance criteria', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('## Acceptance Criteria to Verify');
    expect(result).toContain('- Code quality acceptable');
    expect(result).toContain('- No bugs found');
  });

  it('omits acceptance criteria when empty', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      task: { name: 'R', description: 'D', acceptance_criteria: [] },
    });
    expect(result).not.toContain('Acceptance Criteria');
  });

  it('omits acceptance criteria when undefined', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      task: { name: 'R', description: 'D' },
    });
    expect(result).not.toContain('Acceptance Criteria');
  });

  it('includes nugget context', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('## Nugget Context');
    expect(result).toContain('Goal: A todo app');
  });

  it('shows "Not specified" for missing goal', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { nugget: {} },
    });
    expect(result).toContain('Goal: Not specified');
  });

  it('handles missing nugget in spec', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {},
    });
    expect(result).toContain('Goal: Not specified');
  });

  it('includes style preferences when provided', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      style: { visual: 'Pastel colors', personality: 'Calm' },
    });
    expect(result).toContain('## Style Preferences');
    expect(result).toContain('Visual Style: Pastel colors');
    expect(result).toContain('Personality: Calm');
  });

  it('omits style when null', () => {
    const result = formatTaskPrompt({ ...baseParams, style: null });
    expect(result).not.toContain('## Style Preferences');
  });

  it('omits style when undefined', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain('## Style Preferences');
  });

  it('includes legacy style fields', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      style: { colors: 'blue', theme: 'ocean', tone: 'friendly' },
    });
    expect(result).toContain('Colors: blue');
    expect(result).toContain('Theme: ocean');
    expect(result).toContain('Tone: friendly');
  });

  it('includes predecessor summaries when present', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      predecessors: ['Built HTML structure', 'Tests all pass'],
    });
    expect(result).toContain('## WHAT HAPPENED BEFORE YOU');
    expect(result).toContain('Built HTML structure');
    expect(result).toContain('Tests all pass');
  });

  it('omits predecessors section when empty', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain('## WHAT HAPPENED BEFORE YOU');
  });

  it('includes review instructions', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('## Instructions');
    expect(result).toContain('Read all code');
    expect(result).toContain('acceptance criterion');
    expect(result).toContain('Review code quality');
  });

  it('includes feature skills', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        skills: [
          { name: 'Dance', prompt: 'Make it dance', category: 'feature' },
        ],
      },
    });
    expect(result).toContain("## Detailed Feature Instructions (kid's skills)");
    expect(result).toContain('<kid_skill name="Dance">');
  });

  it('includes style skills', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        skills: [
          { name: 'Glow', prompt: 'Add glow effect', category: 'style' },
        ],
      },
    });
    expect(result).toContain("## Detailed Style Instructions (kid's skills)");
    expect(result).toContain('<kid_skill name="Glow">');
  });

  it('includes on_task_complete rules only', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        rules: [
          { name: 'Final check', prompt: 'Verify output', trigger: 'on_task_complete' },
          { name: 'Lint', prompt: 'Run linter', trigger: 'before_deploy' },
        ],
      },
    });
    expect(result).toContain("## Validation Rules (kid's rules)");
    expect(result).toContain('<kid_rule name="Final check">');
    expect(result).not.toContain('Lint');
  });

  it('omits rules section when empty', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { ...baseParams.spec, rules: [] },
    });
    expect(result).not.toContain("## Validation Rules");
  });

  it('omits skills/rules sections when missing from spec', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain("kid's skills");
    expect(result).not.toContain("kid's rules");
  });

  it('does NOT include portals (reviewer has no portal section)', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        portals: [{ name: 'api', description: 'An API', mechanism: 'mcp' }],
      },
    });
    expect(result).not.toContain('## Available Portals');
  });
});
