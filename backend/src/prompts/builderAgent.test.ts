import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, formatTaskPrompt, formatStyle } from './builderAgent.js';

describe('builderAgent SYSTEM_PROMPT', () => {
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

  it('contains security restrictions', () => {
    expect(SYSTEM_PROMPT).toContain('Security Restrictions');
    expect(SYSTEM_PROMPT).toContain('kid_skill');
    expect(SYSTEM_PROMPT).toContain('kid_rule');
    expect(SYSTEM_PROMPT).toContain('user_input');
  });

  it('defines builder role', () => {
    expect(SYSTEM_PROMPT).toContain('BUILDER');
  });
});

describe('formatStyle', () => {
  it('formats current frontend fields (visual + personality)', () => {
    const result = formatStyle({ visual: 'Retro pixel art', personality: 'Playful' });
    expect(result).toContain('Visual Style: Retro pixel art');
    expect(result).toContain('Personality: Playful');
  });

  it('formats legacy fields (colors, theme, tone)', () => {
    const result = formatStyle({ colors: 'blue', theme: 'ocean', tone: 'friendly' });
    expect(result).toContain('Colors: blue');
    expect(result).toContain('Theme: ocean');
    expect(result).toContain('Tone: friendly');
  });

  it('handles mixed current and legacy fields', () => {
    const result = formatStyle({ visual: 'Modern', colors: 'red', tone: 'casual' });
    expect(result).toContain('Visual Style: Modern');
    expect(result).toContain('Colors: red');
    expect(result).toContain('Tone: casual');
  });

  it('returns fallback text for empty style object', () => {
    expect(formatStyle({})).toBe('No specific style preferences.');
  });

  it('ignores unknown keys', () => {
    const result = formatStyle({ unknown_key: 'value' });
    expect(result).toBe('No specific style preferences.');
  });

  it('handles style with only one field', () => {
    expect(formatStyle({ visual: 'Dark mode' })).toBe('Visual Style: Dark mode');
  });
});

describe('formatTaskPrompt', () => {
  const baseParams = {
    agentName: 'Builder Bot',
    role: 'builder',
    persona: 'A friendly robot',
    task: {
      name: 'Build UI',
      description: 'Create the main UI',
      acceptance_criteria: ['Page renders', 'Button works'],
    },
    spec: {
      nugget: { goal: 'A cool game', type: 'software', description: 'A fun game' },
      deployment: { target: 'preview' },
    },
    predecessors: [],
  };

  it('includes task name and description', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('# Task: Build UI');
    expect(result).toContain('Create the main UI');
  });

  it('includes acceptance criteria when present', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('## Acceptance Criteria');
    expect(result).toContain('- Page renders');
    expect(result).toContain('- Button works');
  });

  it('omits acceptance criteria section when empty array', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      task: { name: 'Test', description: 'Desc', acceptance_criteria: [] },
    });
    expect(result).not.toContain('Acceptance Criteria');
  });

  it('omits acceptance criteria section when undefined', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      task: { name: 'Test', description: 'Desc' },
    });
    expect(result).not.toContain('Acceptance Criteria');
  });

  it('includes nugget context with goal and description', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).toContain('## Nugget Context');
    expect(result).toContain('Goal: A cool game');
    expect(result).toContain('Description: A fun game');
  });

  it('shows "Not specified" when nugget goal is missing', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { nugget: {} },
    });
    expect(result).toContain('Goal: Not specified');
  });

  it('omits description when not provided in nugget', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { nugget: { goal: 'A game' } },
    });
    expect(result).toContain('Goal: A game');
    expect(result).not.toContain('Description:');
  });

  it('handles completely missing nugget in spec', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {},
    });
    expect(result).toContain('Goal: Not specified');
  });

  it('includes requirements section when present', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        requirements: [
          { type: 'feature', description: 'Add login' },
          { type: 'constraint', description: 'Must be responsive' },
        ],
      },
    });
    expect(result).toContain('## Nugget Requirements');
    expect(result).toContain('- [feature] Add login');
    expect(result).toContain('- [constraint] Must be responsive');
  });

  it('handles requirement with missing type and description', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        requirements: [{}],
      },
    });
    expect(result).toContain('- [feature] ');
  });

  it('omits requirements section when empty array', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { ...baseParams.spec, requirements: [] },
    });
    expect(result).not.toContain('## Nugget Requirements');
  });

  it('omits requirements section when missing', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain('## Nugget Requirements');
  });

  it('includes style preferences when style is provided', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      style: { visual: 'Neon colors', personality: 'Energetic' },
    });
    expect(result).toContain('## Style Preferences');
    expect(result).toContain('Visual Style: Neon colors');
    expect(result).toContain('Personality: Energetic');
  });

  it('omits style section when style is null', () => {
    const result = formatTaskPrompt({ ...baseParams, style: null });
    expect(result).not.toContain('## Style Preferences');
  });

  it('omits style section when style is undefined', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain('## Style Preferences');
  });

  it('includes predecessor summaries when present', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      predecessors: ['Created index.html with basic layout', 'Added CSS styling'],
    });
    expect(result).toContain('## WHAT HAPPENED BEFORE YOU');
    expect(result).toContain('Created index.html with basic layout');
    expect(result).toContain('Added CSS styling');
  });

  it('omits predecessors section when empty', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain('## WHAT HAPPENED BEFORE YOU');
  });

  it('includes deployment target when present', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { ...baseParams.spec, deployment: { target: 'esp32' } },
    });
    expect(result).toContain('## Deployment Target: esp32');
  });

  it('omits deployment target when not present', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { nugget: { goal: 'Test' } },
    });
    expect(result).not.toContain('## Deployment Target');
  });

  it('includes feature skills filtered by category', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        skills: [
          { name: 'Jump', prompt: 'Make it jump', category: 'feature' },
          { name: 'Sparkle', prompt: 'Add sparkles', category: 'style' },
        ],
      },
    });
    expect(result).toContain("## Detailed Feature Instructions (kid's skills)");
    expect(result).toContain('<kid_skill name="Jump">');
    expect(result).toContain('Make it jump');
  });

  it('includes style skills filtered by category', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        skills: [
          { name: 'Sparkle', prompt: 'Add sparkles', category: 'style' },
          { name: 'Jump', prompt: 'Make it jump', category: 'feature' },
        ],
      },
    });
    expect(result).toContain("## Detailed Style Instructions (kid's skills)");
    expect(result).toContain('<kid_skill name="Sparkle">');
    expect(result).toContain('Add sparkles');
  });

  it('omits feature skills section when none have feature category', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        skills: [{ name: 'Sparkle', prompt: 'Add sparkles', category: 'style' }],
      },
    });
    expect(result).not.toContain("## Detailed Feature Instructions");
  });

  it('omits style skills section when none have style category', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        skills: [{ name: 'Jump', prompt: 'Make it jump', category: 'feature' }],
      },
    });
    expect(result).not.toContain("## Detailed Style Instructions");
  });

  it('handles empty skills array', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { ...baseParams.spec, skills: [] },
    });
    expect(result).not.toContain("kid's skills");
  });

  it('includes on_task_complete rules', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        rules: [
          { name: 'Check colors', prompt: 'Ensure bright colors', trigger: 'on_task_complete' },
          { name: 'Before deploy', prompt: 'Validate', trigger: 'before_deploy' },
        ],
      },
    });
    expect(result).toContain("## Validation Rules (kid's rules)");
    expect(result).toContain('<kid_rule name="Check colors">');
    expect(result).toContain('Ensure bright colors');
    // before_deploy rule should not appear
    expect(result).not.toContain('Before deploy');
  });

  it('omits rules section when no on_task_complete rules', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        rules: [{ name: 'Deploy check', prompt: 'Check', trigger: 'before_deploy' }],
      },
    });
    expect(result).not.toContain("## Validation Rules");
  });

  it('omits rules section when rules array is empty', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { ...baseParams.spec, rules: [] },
    });
    expect(result).not.toContain("## Validation Rules");
  });

  it('includes portal context with capabilities and interactions', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        portals: [
          {
            name: 'weather-api',
            description: 'Weather data API',
            mechanism: 'mcp',
            capabilities: [
              { kind: 'query', name: 'getTemp', description: 'Get temperature' },
            ],
            interactions: [
              { type: 'ask', capabilityId: 'getTemp' },
            ],
          },
        ],
      },
    });
    expect(result).toContain('## Available Portals');
    expect(result).toContain('<user_input name="portal:weather-api">');
    expect(result).toContain('Description: Weather data API');
    expect(result).toContain('Mechanism: mcp');
    expect(result).toContain('[query] getTemp: Get temperature');
    expect(result).toContain('ask: getTemp');
  });

  it('includes portal without capabilities or interactions', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        portals: [
          {
            name: 'serial-board',
            description: 'ESP32 board',
            mechanism: 'serial',
          },
        ],
      },
    });
    expect(result).toContain('## Available Portals');
    expect(result).toContain('Description: ESP32 board');
    expect(result).toContain('Mechanism: serial');
    expect(result).not.toContain('Capabilities:');
    expect(result).not.toContain('Requested interactions:');
  });

  it('omits portals section when empty array', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: { ...baseParams.spec, portals: [] },
    });
    expect(result).not.toContain('## Available Portals');
  });

  it('omits portals section when missing', () => {
    const result = formatTaskPrompt(baseParams);
    expect(result).not.toContain('## Available Portals');
  });

  it('includes multiple portals', () => {
    const result = formatTaskPrompt({
      ...baseParams,
      spec: {
        ...baseParams.spec,
        portals: [
          { name: 'p1', description: 'Portal 1', mechanism: 'mcp' },
          { name: 'p2', description: 'Portal 2', mechanism: 'cli' },
        ],
      },
    });
    expect(result).toContain('portal:p1');
    expect(result).toContain('portal:p2');
  });
});
