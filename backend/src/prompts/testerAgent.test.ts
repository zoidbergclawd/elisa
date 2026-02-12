import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, formatTaskPrompt } from './testerAgent.js';

describe('testerAgent SYSTEM_PROMPT', () => {
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

  it('defines tester role', () => {
    expect(SYSTEM_PROMPT).toContain('TESTER');
  });

  it('contains security restrictions', () => {
    expect(SYSTEM_PROMPT).toContain('Security Restrictions');
  });

  it('includes PASS/FAIL reporting format', () => {
    expect(SYSTEM_PROMPT).toContain('PASS or FAIL');
  });
});

describe('testerAgent formatTaskPrompt', () => {
  const baseParams = {
    agentName: 'Test Bot',
    role: 'tester',
    persona: 'A detective',
    task: {
      name: 'Test login',
      description: 'Verify login works',
      acceptance_criteria: ['Login succeeds', 'Error shown on bad password'],
    },
    spec: {
      nugget: { goal: 'A user portal', type: 'software' },
      deployment: { target: 'preview' },
    },
    predecessors: [],
  };

  it('includes task name and description', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('# Task: Test login');
    expect(result).toContain('Verify login works');
  });

  it('includes acceptance criteria', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('## Acceptance Criteria to Verify');
    expect(result).toContain('- Login succeeds');
    expect(result).toContain('- Error shown on bad password');
  });

  it('omits acceptance criteria when empty', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      task: { name: 'T', description: 'D', acceptance_criteria: [] },
    });
    expect(result).not.toContain('Acceptance Criteria');
  });

  it('omits acceptance criteria when undefined', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      task: { name: 'T', description: 'D' },
    });
    expect(result).not.toContain('Acceptance Criteria');
  });

  it('includes nugget context', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('## Nugget Context');
    expect(result).toContain('Goal: A user portal');
  });

  it('shows "Not specified" when nugget goal is missing', () => {
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

  describe('tech stack selection', () => {
    it('shows MicroPython tech stack for hardware nugget type', () => {
      const result = formatTaskPrompt({
        ...baseParams,
        spec: {
          nugget: { goal: 'Blink LED', type: 'hardware' },
          deployment: { target: 'esp32' },
        },
      });
      expect(result).toContain('## Tech Stack');
      expect(result).toContain('MicroPython');
      expect(result).toContain('py_compile');
      expect(result).toContain('ESP32');
    });

    it('shows MicroPython tech stack for esp32 deploy target with software type', () => {
      const result = formatTaskPrompt({
        ...baseParams,
        spec: {
          nugget: { goal: 'Blink', type: 'software' },
          deployment: { target: 'esp32' },
        },
      });
      expect(result).toContain('MicroPython');
    });

    it('shows MicroPython tech stack for "both" deploy target', () => {
      const result = formatTaskPrompt({
        ...baseParams,
        spec: {
          nugget: { goal: 'IoT app', type: 'software' },
          deployment: { target: 'both' },
        },
      });
      expect(result).toContain('MicroPython');
    });

    it('shows software tech stack for preview deploy target', () => {
      const result = formatTaskPrompt({
        ...baseParams,
        spec: {
          nugget: { goal: 'A game', type: 'software' },
          deployment: { target: 'preview' },
        },
      });
      expect(result).toContain('## Tech Stack');
      expect(result).toContain('pytest');
      expect(result).toContain('Vitest');
      expect(result).not.toContain('MicroPython');
    });

    it('shows software tech stack when deploy target is absent', () => {
      const result = formatTaskPrompt({
        ...baseParams,
        spec: {
          nugget: { goal: 'A game', type: 'software' },
        },
      });
      expect(result).toContain('pytest');
      expect(result).toContain('Vitest');
    });

    it('shows software tech stack for web deploy target', () => {
      const result = formatTaskPrompt({
        ...baseParams,
        spec: {
          nugget: { goal: 'A site', type: 'software' },
          deployment: { target: 'web' },
        },
      });
      expect(result).toContain('pytest');
      expect(result).not.toContain('MicroPython');
    });
  });

  it('includes predecessor summaries when present', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      predecessors: ['Built the login page', 'Added CSS'],
    });
    expect(result).toContain('## WHAT HAPPENED BEFORE YOU');
    expect(result).toContain('Built the login page');
    expect(result).toContain('Added CSS');
  });

  it('omits predecessors section when empty', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain('## WHAT HAPPENED BEFORE YOU');
  });

  it('includes testing instructions', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('## Instructions');
    expect(result).toContain('Read the code');
    expect(result).toContain('Write tests');
    expect(result).toContain('Run the tests');
    expect(result).toContain('Report results');
  });

  it('includes feature skills', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        skills: [
          { name: 'Fly', prompt: 'Make it fly', category: 'feature' },
        ],
      },
    });
    expect(result).toContain("## Detailed Feature Instructions (kid's skills)");
    expect(result).toContain('<kid_skill name="Fly">');
    expect(result).toContain('Make it fly');
  });

  it('includes style skills', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        skills: [
          { name: 'Rainbow', prompt: 'Make it rainbow', category: 'style' },
        ],
      },
    });
    expect(result).toContain("## Detailed Style Instructions (kid's skills)");
    expect(result).toContain('<kid_skill name="Rainbow">');
  });

  it('includes on_task_complete rules only', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        rules: [
          { name: 'Validate', prompt: 'Check output', trigger: 'on_task_complete' },
          { name: 'Pre-deploy', prompt: 'Lint check', trigger: 'before_deploy' },
        ],
      },
    });
    expect(result).toContain("## Validation Rules (kid's rules)");
    expect(result).toContain('<kid_rule name="Validate">');
    expect(result).not.toContain('Pre-deploy');
  });

  it('omits skills/rules sections when missing from spec', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain("kid's skills");
    expect(result).not.toContain("kid's rules");
  });

  it('does NOT include portals (tester has no portal section)', () => {
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
