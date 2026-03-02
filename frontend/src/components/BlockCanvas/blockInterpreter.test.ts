/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { interpretWorkspace, migrateWorkspace } from './blockInterpreter';
import type { Skill, Rule } from '../Skills/types';
import type { Portal } from '../Portals/types';

function makeWorkspace(blocks: unknown[]) {
  return { blocks: { blocks } };
}

function goalBlock(text: string, next?: unknown) {
  return {
    type: 'nugget_goal',
    fields: { GOAL_TEXT: text },
    ...(next ? { next: { block: next } } : {}),
  };
}

/** Chain multiple block objects via next pointers. Returns the first block. */
function chainBlocks(first: Record<string, unknown>, ...rest: Record<string, unknown>[]) {
  if (rest.length === 0) return first;
  let current = first;
  for (const block of rest) {
    current.next = { block };
    current = block;
  }
  return first;
}

describe('blockInterpreter', () => {
  describe('empty and missing workspace structures', () => {
    it('returns default spec for empty workspace', () => {
      const spec = interpretWorkspace(makeWorkspace([]));
      expect(spec.nugget.goal).toBe('');
      expect(spec.nugget.description).toBe('');
      expect(spec.nugget.type).toBe('general');
      expect(spec.requirements).toEqual([]);
      expect(spec.agents).toEqual([]);
      expect(spec.deployment).toEqual({ target: 'preview', auto_flash: false });
      expect(spec.workflow.review_enabled).toBe(false);
      expect(spec.workflow.testing_enabled).toBe(false);
      expect(spec.workflow.human_gates).toEqual([]);
      expect(spec.workflow.flow_hints).toEqual([]);
      expect(spec.workflow.iteration_conditions).toEqual([]);
    });

    it('returns default spec when no goal block exists', () => {
      const spec = interpretWorkspace(makeWorkspace([
        { type: 'feature', fields: { FEATURE_TEXT: 'orphan feature' } },
      ]));
      expect(spec.nugget.goal).toBe('');
      expect(spec.requirements).toEqual([]);
    });

    it('returns default spec for workspace with no blocks key', () => {
      const spec = interpretWorkspace({});
      expect(spec.nugget.goal).toBe('');
      expect(spec.requirements).toEqual([]);
    });

    it('returns default spec for workspace with empty blocks object', () => {
      const spec = interpretWorkspace({ blocks: {} });
      expect(spec.nugget.goal).toBe('');
    });

    it('initializes flow_hints and iteration_conditions as empty arrays', () => {
      const spec = interpretWorkspace(makeWorkspace([goalBlock('Test')]));
      expect(spec.workflow.flow_hints).toEqual([]);
      expect(spec.workflow.iteration_conditions).toEqual([]);
    });
  });

  describe('nugget_goal block', () => {
    it('parses goal text and sets description', () => {
      const spec = interpretWorkspace(makeWorkspace([goalBlock('Build a game')]));
      expect(spec.nugget.goal).toBe('Build a game');
      expect(spec.nugget.description).toBe('Build a game');
    });

    it('defaults to empty string when GOAL_TEXT is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        { type: 'nugget_goal', fields: {} },
      ]));
      expect(spec.nugget.goal).toBe('');
    });

    it('defaults to empty string when fields is undefined', () => {
      const spec = interpretWorkspace(makeWorkspace([
        { type: 'nugget_goal' },
      ]));
      expect(spec.nugget.goal).toBe('');
    });
  });

  describe('nugget_template block', () => {
    it('sets nugget type from template', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('My nugget', { type: 'nugget_template', fields: { TEMPLATE_TYPE: 'game' } }),
      ]));
      expect(spec.nugget.type).toBe('game');
    });

    it('defaults to general when TEMPLATE_TYPE is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'nugget_template', fields: {} }),
      ]));
      expect(spec.nugget.type).toBe('general');
    });
  });

  describe('feature block', () => {
    it('adds a feature requirement', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'feature', fields: { FEATURE_TEXT: 'drag and drop' } }),
      ]));
      expect(spec.requirements).toHaveLength(1);
      expect(spec.requirements[0]).toEqual({ type: 'feature', description: 'drag and drop' });
    });

    it('defaults to empty string when FEATURE_TEXT is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'feature', fields: {} }),
      ]));
      expect(spec.requirements[0].description).toBe('');
    });
  });

  describe('constraint block', () => {
    it('adds a constraint requirement', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'constraint', fields: { CONSTRAINT_TEXT: 'crash' } }),
      ]));
      expect(spec.requirements).toContainEqual({ type: 'constraint', description: 'crash' });
    });
  });

  describe('when_then block', () => {
    it('adds a when_then requirement with formatted description', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'when_then', fields: { TRIGGER_TEXT: 'click', ACTION_TEXT: 'jump' } }),
      ]));
      expect(spec.requirements[0].type).toBe('when_then');
      expect(spec.requirements[0].description).toBe('When click happens, jump should happen');
    });
  });

  describe('has_data block', () => {
    it('adds a data requirement', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'has_data', fields: { DATA_TEXT: 'user scores' } }),
      ]));
      expect(spec.requirements).toContainEqual({ type: 'data', description: 'user scores' });
    });
  });

  describe('style blocks', () => {
    it('look_like sets visual style', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'look_like', fields: { STYLE_PRESET: 'dark_techy' } }),
      ]));
      expect(spec.style).toEqual({ visual: 'dark_techy', personality: null });
    });

    it('personality sets personality style', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'personality', fields: { PERSONALITY_TEXT: 'sarcastic' } }),
      ]));
      expect(spec.style).toEqual({ visual: null, personality: 'sarcastic' });
    });

    it('both style blocks combine into one style object', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'look_like', fields: { STYLE_PRESET: 'space' } },
          { type: 'personality', fields: { PERSONALITY_TEXT: 'calm' } },
        ),
      ]));
      expect(spec.style).toEqual({ visual: 'space', personality: 'calm' });
    });
  });

  describe('agent blocks', () => {
    it('agent_builder adds a builder agent', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_builder', fields: { AGENT_NAME: 'Bob', AGENT_PERSONA: 'careful coder' } }),
      ]));
      expect(spec.agents).toHaveLength(1);
      expect(spec.agents[0]).toEqual({ name: 'Bob', role: 'builder', persona: 'careful coder' });
    });

    it('agent_builder uses default name when AGENT_NAME is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_builder', fields: {} }),
      ]));
      expect(spec.agents[0].name).toBe('Builder');
      expect(spec.agents[0].persona).toBe('');
    });

    it('agent_tester adds a tester agent and enables testing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_tester', fields: { AGENT_NAME: 'Testy', AGENT_PERSONA: 'thorough' } }),
      ]));
      expect(spec.agents).toHaveLength(1);
      expect(spec.agents[0]).toEqual({ name: 'Testy', role: 'tester', persona: 'thorough' });
      expect(spec.workflow.testing_enabled).toBe(true);
    });

    it('agent_tester uses default name when AGENT_NAME is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_tester', fields: {} }),
      ]));
      expect(spec.agents[0].name).toBe('Tester');
    });

    it('agent_reviewer adds a reviewer agent and enables review', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_reviewer', fields: { AGENT_NAME: 'Rev', AGENT_PERSONA: 'strict' } }),
      ]));
      expect(spec.agents).toContainEqual({ name: 'Rev', role: 'reviewer', persona: 'strict' });
      expect(spec.workflow.review_enabled).toBe(true);
    });

    it('agent_reviewer uses default name when AGENT_NAME is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_reviewer', fields: {} }),
      ]));
      expect(spec.agents[0].name).toBe('Reviewer');
    });

    it('agent_custom adds a custom agent', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_custom', fields: { AGENT_NAME: 'Doc', AGENT_PERSONA: 'writes docs' } }),
      ]));
      expect(spec.agents).toContainEqual({ name: 'Doc', role: 'custom', persona: 'writes docs' });
    });

    it('agent_custom uses default name when AGENT_NAME is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_custom', fields: {} }),
      ]));
      expect(spec.agents[0].name).toBe('Helper');
    });

    it('multiple agent blocks accumulate in order', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'agent_builder', fields: { AGENT_NAME: 'B1', AGENT_PERSONA: 'p1' } },
          { type: 'agent_tester', fields: { AGENT_NAME: 'T1', AGENT_PERSONA: 'p2' } },
          { type: 'agent_reviewer', fields: { AGENT_NAME: 'R1', AGENT_PERSONA: 'p3' } },
          { type: 'agent_custom', fields: { AGENT_NAME: 'C1', AGENT_PERSONA: 'p4' } },
        ),
      ]));
      expect(spec.agents).toHaveLength(4);
      expect(spec.agents.map(a => a.role)).toEqual(['builder', 'tester', 'reviewer', 'custom']);
      expect(spec.workflow.testing_enabled).toBe(true);
      expect(spec.workflow.review_enabled).toBe(true);
    });
  });

  describe('deploy blocks', () => {
    it('deploy_web sets web deployment target', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'deploy_web' }),
      ]));
      expect(spec.deployment.target).toBe('web');
      expect(spec.deployment.auto_flash).toBe(false);
    });

    it('deploy_esp32 sets esp32 target with auto_flash and hardware type', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'deploy_esp32' }),
      ]));
      expect(spec.deployment.target).toBe('esp32');
      expect(spec.deployment.auto_flash).toBe(true);
      expect(spec.nugget.type).toBe('hardware');
    });

    it('deploy_both sets both target', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'deploy_both' }),
      ]));
      expect(spec.deployment.target).toBe('both');
    });

    it('deploy_web + deploy_esp32 in chain results in both', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'deploy_web' },
          { type: 'deploy_esp32' },
        ),
      ]));
      expect(spec.deployment.target).toBe('both');
    });

    it('timer_every adds timer requirement without implying esp32', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'timer_every', fields: { INTERVAL: 10 } }),
      ]));
      expect(spec.deployment.target).toBe('preview');
      expect(spec.requirements).toContainEqual({ type: 'timer', description: 'Repeat every 10 seconds' });
    });

    it('timer_every + deploy_web results in web', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'timer_every', fields: { INTERVAL: 5 } },
          { type: 'deploy_web' },
        ),
      ]));
      expect(spec.deployment.target).toBe('web');
    });
  });

  describe('flow blocks', () => {
    it('first_then creates sequential flow hint', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'first_then',
          inputs: {
            FIRST_BLOCKS: { block: { type: 'feature', fields: { FEATURE_TEXT: 'build UI' } } },
            THEN_BLOCKS: { block: { type: 'feature', fields: { FEATURE_TEXT: 'add tests' } } },
          },
        }),
      ]));
      expect(spec.workflow.flow_hints).toHaveLength(1);
      expect(spec.workflow.flow_hints![0].type).toBe('sequential');
      expect(spec.workflow.flow_hints![0].descriptions).toEqual(['build UI', 'add tests']);
    });

    it('first_then with chained inner blocks collects all descriptions', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'first_then',
          inputs: {
            FIRST_BLOCKS: {
              block: {
                type: 'feature', fields: { FEATURE_TEXT: 'login' },
                next: { block: { type: 'feature', fields: { FEATURE_TEXT: 'dashboard' } } },
              },
            },
            THEN_BLOCKS: {
              block: { type: 'feature', fields: { FEATURE_TEXT: 'deploy' } },
            },
          },
        }),
      ]));
      expect(spec.workflow.flow_hints![0].descriptions).toEqual(['login', 'dashboard', 'deploy']);
    });

    it('first_then with empty inputs produces empty descriptions', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'first_then' }),
      ]));
      expect(spec.workflow.flow_hints).toHaveLength(1);
      expect(spec.workflow.flow_hints![0].type).toBe('sequential');
      expect(spec.workflow.flow_hints![0].descriptions).toEqual([]);
    });

    it('first_then falls back to GOAL_TEXT then block type for descriptions', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'first_then',
          inputs: {
            FIRST_BLOCKS: { block: { type: 'nugget_goal', fields: { GOAL_TEXT: 'setup' } } },
            THEN_BLOCKS: { block: { type: 'deploy_web' } },
          },
        }),
      ]));
      expect(spec.workflow.flow_hints![0].descriptions).toEqual(['setup', 'deploy_web']);
    });

    it('at_same_time creates parallel flow hint', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'at_same_time',
          inputs: {
            PARALLEL_BLOCKS: {
              block: {
                type: 'feature', fields: { FEATURE_TEXT: 'api' },
                next: { block: { type: 'feature', fields: { FEATURE_TEXT: 'ui' } } },
              },
            },
          },
        }),
      ]));
      expect(spec.workflow.flow_hints).toHaveLength(1);
      expect(spec.workflow.flow_hints![0].type).toBe('parallel');
      expect(spec.workflow.flow_hints![0].descriptions).toEqual(['api', 'ui']);
    });

    it('at_same_time with no inputs produces empty descriptions', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'at_same_time' }),
      ]));
      expect(spec.workflow.flow_hints).toHaveLength(1);
      expect(spec.workflow.flow_hints![0].descriptions).toEqual([]);
    });

    it('keep_improving adds iteration condition', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'keep_improving', fields: { CONDITION_TEXT: 'all tests pass' } }),
      ]));
      expect(spec.workflow.iteration_conditions).toEqual(['all tests pass']);
    });

    it('check_with_me adds human gate and enables review', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'check_with_me', fields: { GATE_DESCRIPTION: 'deploying' } }),
      ]));
      expect(spec.workflow.human_gates).toContain('deploying');
      expect(spec.workflow.review_enabled).toBe(true);
    });

    it('timer_every adds timer requirement', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'timer_every', fields: { INTERVAL: 10 } }),
      ]));
      expect(spec.requirements).toContainEqual({ type: 'timer', description: 'Repeat every 10 seconds' });
    });

    it('timer_every defaults interval to 5 when field is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'timer_every', fields: {} }),
      ]));
      expect(spec.requirements).toContainEqual({ type: 'timer', description: 'Repeat every 5 seconds' });
    });
  });

  describe('skills blocks', () => {
    const skills: Skill[] = [
      { id: 'skill-1', name: 'Be Creative', prompt: 'Use bright colors', category: 'style' },
      { id: 'skill-2', name: 'Composite Flow', prompt: 'Multi-step', category: 'composite', workspace: { blocks: { blocks: [] } } },
    ];

    it('use_skill resolves skill from array', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: 'skill-1' } })]),
        skills,
      );
      expect(spec.skills).toHaveLength(1);
      expect(spec.skills![0]).toEqual({
        id: 'skill-1', name: 'Be Creative', prompt: 'Use bright colors', category: 'style',
      });
    });

    it('use_skill includes workspace for composite skills', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: 'skill-2' } })]),
        skills,
      );
      expect(spec.skills).toHaveLength(1);
      expect(spec.skills![0].workspace).toEqual({ blocks: { blocks: [] } });
    });

    it('use_skill does not include workspace for non-composite skills', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: 'skill-1' } })]),
        skills,
      );
      expect(spec.skills![0].workspace).toBeUndefined();
    });

    it('ignores use_skill with unknown ID', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: 'nonexistent' } })]),
        skills,
      );
      expect(spec.skills).toBeUndefined();
    });

    it('ignores use_skill with empty ID', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: '' } })]),
        skills,
      );
      expect(spec.skills).toBeUndefined();
    });

    it('ignores use_skill when no skills array provided', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: 'skill-1' } })]),
      );
      expect(spec.skills).toBeUndefined();
    });

    it('multiple use_skill blocks accumulate', () => {
      const spec = interpretWorkspace(
        makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
            { type: 'use_skill', fields: { SKILL_ID: 'skill-1' } },
            { type: 'use_skill', fields: { SKILL_ID: 'skill-2' } },
          ),
        ]),
        skills,
      );
      expect(spec.skills).toHaveLength(2);
    });
  });

  describe('rules blocks', () => {
    const rules: Rule[] = [
      { id: 'rule-1', name: 'Always Comment', prompt: 'Add comments everywhere', trigger: 'always' },
    ];

    it('use_rule resolves rule from array', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_rule', fields: { RULE_ID: 'rule-1' } })]),
        undefined, rules,
      );
      expect(spec.rules).toHaveLength(1);
      expect(spec.rules![0]).toEqual({
        id: 'rule-1', name: 'Always Comment', prompt: 'Add comments everywhere', trigger: 'always',
      });
    });

    it('ignores use_rule with unknown ID', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_rule', fields: { RULE_ID: 'nonexistent' } })]),
        undefined, rules,
      );
      expect(spec.rules).toBeUndefined();
    });

    it('ignores use_rule with empty ID', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_rule', fields: { RULE_ID: '' } })]),
        undefined, rules,
      );
      expect(spec.rules).toBeUndefined();
    });

    it('ignores use_rule when no rules array provided', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'use_rule', fields: { RULE_ID: 'rule-1' } })]),
      );
      expect(spec.rules).toBeUndefined();
    });
  });

  describe('portal blocks', () => {
    const portals: Portal[] = [
      {
        id: 'portal-1',
        name: 'My CLI Tool',
        description: 'A CLI tool',
        mechanism: 'cli',
        status: 'unconfigured',
        capabilities: [
          { id: 'led-on', name: 'LED on', kind: 'action', description: 'Turn LED on' },
          { id: 'btn-press', name: 'Button pressed', kind: 'event', description: 'Button event' },
          { id: 'read-temp', name: 'Read temperature', kind: 'query', description: 'Read temp sensor' },
        ],
        cliConfig: { command: 'my-tool', args: ['--verbose'] },
      },
      {
        id: 'portal-2',
        name: 'Weather MCP',
        description: 'Weather API',
        mechanism: 'mcp',
        status: 'ready',
        capabilities: [
          { id: 'get-forecast', name: 'Get Forecast', kind: 'action', description: 'Fetch forecast' },
        ],
        mcpConfig: { command: 'weather-mcp', args: ['--api'] },
      },
    ];

    it('portal_tell creates portal entry with tell interaction', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'led-on' } })]),
        undefined, undefined, portals,
      );
      expect(spec.portals).toHaveLength(1);
      expect(spec.portals![0].name).toBe('My CLI Tool');
      expect(spec.portals![0].mechanism).toBe('cli');
      expect(spec.portals![0].interactions).toContainEqual({ type: 'tell', capabilityId: 'led-on' });
    });

    it('portal_when creates when interaction', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_when', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'btn-press' } })]),
        undefined, undefined, portals,
      );
      expect(spec.portals![0].interactions).toContainEqual({ type: 'when', capabilityId: 'btn-press' });
    });

    it('portal_ask creates ask interaction', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_ask', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'read-temp' } })]),
        undefined, undefined, portals,
      );
      expect(spec.portals![0].interactions).toContainEqual({ type: 'ask', capabilityId: 'read-temp' });
    });

    it('groups multiple interactions for the same portal', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', {
          type: 'portal_tell',
          fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'led-on' },
          next: { block: { type: 'portal_ask', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'read-temp' } } },
        })]),
        undefined, undefined, portals,
      );
      expect(spec.portals).toHaveLength(1);
      expect(spec.portals![0].interactions).toHaveLength(2);
      expect(spec.portals![0].interactions[0]).toEqual({ type: 'tell', capabilityId: 'led-on' });
      expect(spec.portals![0].interactions[1]).toEqual({ type: 'ask', capabilityId: 'read-temp' });
    });

    it('creates separate entries for different portals', () => {
      const spec = interpretWorkspace(
        makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
            { type: 'portal_tell', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'led-on' } },
            { type: 'portal_tell', fields: { PORTAL_ID: 'portal-2', CAPABILITY_ID: 'get-forecast' } },
          ),
        ]),
        undefined, undefined, portals,
      );
      expect(spec.portals).toHaveLength(2);
      expect(spec.portals![0].id).toBe('portal-1');
      expect(spec.portals![1].id).toBe('portal-2');
    });

    it('includes mcpConfig in portal entry', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'portal-2', CAPABILITY_ID: 'get-forecast' } })]),
        undefined, undefined, portals,
      );
      expect(spec.portals![0].mcpConfig).toEqual({ command: 'weather-mcp', args: ['--api'] });
    });

    it('ignores portal block with unknown portal ID', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'nonexistent', CAPABILITY_ID: 'led-on' } })]),
        undefined, undefined, portals,
      );
      expect(spec.portals).toBeUndefined();
    });

    it('ignores portal block with empty portal ID', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: '', CAPABILITY_ID: 'led-on' } })]),
        undefined, undefined, portals,
      );
      expect(spec.portals).toBeUndefined();
    });

    it('ignores portal block with empty capability ID', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: '' } })]),
        undefined, undefined, portals,
      );
      expect(spec.portals).toBeUndefined();
    });

    it('ignores portal block when no portals array provided', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'led-on' } })]),
      );
      expect(spec.portals).toBeUndefined();
    });

    describe('capability params', () => {
      const portalsWithParams: Portal[] = [
        {
          id: 'portal-params',
          name: 'Param Board',
          description: 'Board with param capabilities',
          mechanism: 'serial',
          status: 'unconfigured',
          capabilities: [
            {
              id: 'led-color', name: 'LED color', kind: 'action', description: 'Set LED color',
              params: [
                { name: 'color', type: 'choice', description: 'LED color', choices: ['red', 'green', 'blue'], default: 'red' },
                { name: 'brightness', type: 'number', description: 'Brightness 0-100', default: 50 },
                { name: 'blinking', type: 'boolean', description: 'Blink mode', default: false },
              ],
            },
            {
              id: 'read-sensor', name: 'Read sensor', kind: 'query', description: 'Read sensor',
              params: [
                { name: 'unit', type: 'string', description: 'Temperature unit' },
              ],
            },
            { id: 'no-params', name: 'Simple action', kind: 'action', description: 'No params' },
          ],
        },
      ];

      it('extracts string param values from block fields', () => {
        const spec = interpretWorkspace(
          makeWorkspace([goalBlock('Test', {
            type: 'portal_ask',
            fields: { PORTAL_ID: 'portal-params', CAPABILITY_ID: 'read-sensor', PARAM_unit: 'celsius' },
          })]),
          undefined, undefined, portalsWithParams,
        );
        expect(spec.portals![0].interactions[0].params).toEqual({ unit: 'celsius' });
      });

      it('extracts number and boolean param values', () => {
        const spec = interpretWorkspace(
          makeWorkspace([goalBlock('Test', {
            type: 'portal_tell',
            fields: { PORTAL_ID: 'portal-params', CAPABILITY_ID: 'led-color', PARAM_color: 'blue', PARAM_brightness: 80, PARAM_blinking: 'TRUE' },
          })]),
          undefined, undefined, portalsWithParams,
        );
        const params = spec.portals![0].interactions[0].params!;
        expect(params.color).toBe('blue');
        expect(params.brightness).toBe(80);
        expect(params.blinking).toBe(true);
      });

      it('uses default values when field is empty', () => {
        const spec = interpretWorkspace(
          makeWorkspace([goalBlock('Test', {
            type: 'portal_tell',
            fields: { PORTAL_ID: 'portal-params', CAPABILITY_ID: 'led-color' },
          })]),
          undefined, undefined, portalsWithParams,
        );
        const params = spec.portals![0].interactions[0].params!;
        expect(params.color).toBe('red');
        expect(params.brightness).toBe(50);
        expect(params.blinking).toBe(false);
      });

      it('handles native boolean true value', () => {
        const spec = interpretWorkspace(
          makeWorkspace([goalBlock('Test', {
            type: 'portal_tell',
            fields: { PORTAL_ID: 'portal-params', CAPABILITY_ID: 'led-color', PARAM_color: 'green', PARAM_brightness: 100, PARAM_blinking: true },
          })]),
          undefined, undefined, portalsWithParams,
        );
        expect(spec.portals![0].interactions[0].params!.blinking).toBe(true);
      });

      it('handles boolean FALSE string from checkbox', () => {
        const spec = interpretWorkspace(
          makeWorkspace([goalBlock('Test', {
            type: 'portal_tell',
            fields: { PORTAL_ID: 'portal-params', CAPABILITY_ID: 'led-color', PARAM_color: 'red', PARAM_brightness: 0, PARAM_blinking: 'FALSE' },
          })]),
          undefined, undefined, portalsWithParams,
        );
        expect(spec.portals![0].interactions[0].params!.blinking).toBe(false);
      });

      it('omits params when capability has no params defined', () => {
        const spec = interpretWorkspace(
          makeWorkspace([goalBlock('Test', {
            type: 'portal_tell',
            fields: { PORTAL_ID: 'portal-params', CAPABILITY_ID: 'no-params' },
          })]),
          undefined, undefined, portalsWithParams,
        );
        expect(spec.portals![0].interactions[0].params).toBeUndefined();
      });

      it('omits params with no default when field is missing', () => {
        const spec = interpretWorkspace(
          makeWorkspace([goalBlock('Test', {
            type: 'portal_ask',
            fields: { PORTAL_ID: 'portal-params', CAPABILITY_ID: 'read-sensor' },
          })]),
          undefined, undefined, portalsWithParams,
        );
        expect(spec.portals![0].interactions[0].params).toBeUndefined();
      });
    });
  });

  describe('behavioral_test block (#105)', () => {
    it('produces workflow.behavioral_tests when socketed into when_then', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'when_then',
          fields: { TRIGGER_TEXT: 'click play', ACTION_TEXT: 'game starts' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'the user clicks play', THEN: 'the game starts' } } } },
        }),
      ]));
      expect(spec.workflow.behavioral_tests).toHaveLength(1);
      expect(spec.workflow.behavioral_tests![0]).toMatchObject({
        when: 'the user clicks play',
        then: 'the game starts',
        id: 'test_0',
        requirement_id: 'req_0',
      });
    });

    it('enables testing when behavioral_test is socketed', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'when_then',
          fields: { TRIGGER_TEXT: 'click', ACTION_TEXT: 'response' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'click', THEN: 'response' } } } },
        }),
      ]));
      expect(spec.workflow.testing_enabled).toBe(true);
    });

    it('accumulates multiple behavioral tests across when_then blocks', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          {
            type: 'when_then',
            fields: { TRIGGER_TEXT: 'click play', ACTION_TEXT: 'game starts' },
            inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'click play', THEN: 'game starts' } } } },
          },
          {
            type: 'when_then',
            fields: { TRIGGER_TEXT: 'click stop', ACTION_TEXT: 'game pauses' },
            inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'click stop', THEN: 'game pauses' } } } },
          },
        ),
      ]));
      expect(spec.workflow.behavioral_tests).toHaveLength(2);
    });

    it('defaults to empty strings when fields are missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'when_then',
          fields: { TRIGGER_TEXT: 'x', ACTION_TEXT: 'y' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: {} } } },
        }),
      ]));
      expect(spec.workflow.behavioral_tests![0]).toMatchObject({ when: '', then: '' });
    });

    it('behavioral_tests is undefined when no behavioral_test blocks exist', () => {
      const spec = interpretWorkspace(makeWorkspace([goalBlock('Test')]));
      expect(spec.workflow.behavioral_tests).toBeUndefined();
    });

    it('links test_id on requirement to socketed behavioral_test', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'when_then',
          fields: { TRIGGER_TEXT: 'click', ACTION_TEXT: 'jump' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'click', THEN: 'jump' } } } },
        }),
      ]));
      expect(spec.requirements[0].test_id).toBe('test_0');
      expect(spec.workflow.behavioral_tests![0].requirement_id).toBe('req_0');
    });

    it('when_then without socketed test has no test_id', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'when_then', fields: { TRIGGER_TEXT: 'click', ACTION_TEXT: 'jump' } }),
      ]));
      expect(spec.requirements[0].test_id).toBeUndefined();
      expect(spec.workflow.behavioral_tests).toBeUndefined();
    });
  });

  describe('feature block TEST_SOCKET (#148)', () => {
    it('produces behavioral_tests when behavioral_test socketed into feature', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'feature',
          fields: { FEATURE_TEXT: 'play music' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'user presses play', THEN: 'music plays' } } } },
        }),
      ]));
      expect(spec.workflow.behavioral_tests).toHaveLength(1);
      expect(spec.workflow.behavioral_tests![0]).toMatchObject({
        when: 'user presses play',
        then: 'music plays',
        id: 'test_0',
        requirement_id: 'req_0',
      });
    });

    it('enables testing when behavioral_test socketed into feature', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'feature',
          fields: { FEATURE_TEXT: 'play music' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'play', THEN: 'music' } } } },
        }),
      ]));
      expect(spec.workflow.testing_enabled).toBe(true);
    });

    it('feature without socketed test has no test_id', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'feature', fields: { FEATURE_TEXT: 'play music' } }),
      ]));
      expect(spec.requirements[0].test_id).toBeUndefined();
      expect(spec.workflow.behavioral_tests).toBeUndefined();
    });

    it('links test_id on feature requirement to socketed behavioral_test', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'feature',
          fields: { FEATURE_TEXT: 'play music' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'press play', THEN: 'music starts' } } } },
        }),
      ]));
      expect(spec.requirements[0].test_id).toBe('test_0');
      expect(spec.workflow.behavioral_tests![0].requirement_id).toBe('req_0');
    });
  });

  describe('has_data block TEST_SOCKET (#148)', () => {
    it('produces behavioral_tests when behavioral_test socketed into has_data', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'has_data',
          fields: { DATA_TEXT: 'user scores' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'game ends', THEN: 'score is saved' } } } },
        }),
      ]));
      expect(spec.workflow.behavioral_tests).toHaveLength(1);
      expect(spec.workflow.behavioral_tests![0]).toMatchObject({
        when: 'game ends',
        then: 'score is saved',
        id: 'test_0',
        requirement_id: 'req_0',
      });
    });

    it('enables testing when behavioral_test socketed into has_data', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'has_data',
          fields: { DATA_TEXT: 'user scores' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'game ends', THEN: 'score saved' } } } },
        }),
      ]));
      expect(spec.workflow.testing_enabled).toBe(true);
    });

    it('has_data without socketed test has no test_id', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'has_data', fields: { DATA_TEXT: 'user scores' } }),
      ]));
      expect(spec.requirements[0].test_id).toBeUndefined();
      expect(spec.workflow.behavioral_tests).toBeUndefined();
    });

    it('links test_id on has_data requirement to socketed behavioral_test', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'has_data',
          fields: { DATA_TEXT: 'user scores' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'game ends', THEN: 'score persisted' } } } },
        }),
      ]));
      expect(spec.requirements[0].test_id).toBe('test_0');
      expect(spec.workflow.behavioral_tests![0].requirement_id).toBe('req_0');
    });
  });

  describe('unknown block types', () => {
    it('unknown blocks in chain are silently ignored', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'completely_unknown_block', fields: { FOO: 'bar' } },
          { type: 'feature', fields: { FEATURE_TEXT: 'real feature' } },
        ),
      ]));
      expect(spec.requirements).toHaveLength(1);
      expect(spec.requirements[0].description).toBe('real feature');
    });
  });

  describe('chain walking', () => {
    it('only processes blocks chained from the goal block', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('my app'),
        { type: 'feature', fields: { FEATURE_TEXT: 'orphan feature' } },
      ]));
      expect(spec.nugget.goal).toBe('my app');
      expect(spec.requirements).toEqual([]);
    });

    it('uses first goal block when multiple exist', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('first goal'),
        goalBlock('second goal'),
      ]));
      expect(spec.nugget.goal).toBe('first goal');
    });
  });

  describe('complete workspace examples', () => {
    it('full workspace with multiple block types combined', () => {
      const skills: Skill[] = [
        { id: 'sk-1', name: 'Review', prompt: 'Do review', category: 'agent' },
      ];
      const rules: Rule[] = [
        { id: 'r-1', name: 'Lint', prompt: 'Lint check', trigger: 'always' },
      ];

      const spec = interpretWorkspace(
        makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'Build a platformer game' } },
            { type: 'nugget_template', fields: { TEMPLATE_TYPE: 'game' } },
            { type: 'feature', fields: { FEATURE_TEXT: 'jump and run' } },
            { type: 'feature', fields: { FEATURE_TEXT: 'collect coins' } },
            { type: 'constraint', fields: { CONSTRAINT_TEXT: 'lag or stutter' } },
            { type: 'has_data', fields: { DATA_TEXT: 'level layouts' } },
            { type: 'look_like', fields: { STYLE_PRESET: 'fun_colorful' } },
            { type: 'personality', fields: { PERSONALITY_TEXT: 'upbeat and encouraging' } },
            { type: 'agent_builder', fields: { AGENT_NAME: 'GameDev', AGENT_PERSONA: 'game dev expert' } },
            { type: 'agent_tester', fields: { AGENT_NAME: 'QA', AGENT_PERSONA: 'thorough tester' } },
            { type: 'keep_improving', fields: { CONDITION_TEXT: 'fun to play' } },
            { type: 'check_with_me', fields: { GATE_DESCRIPTION: 'publishing' } },
            { type: 'deploy_web' },
            { type: 'use_skill', fields: { SKILL_ID: 'sk-1' } },
            { type: 'use_rule', fields: { RULE_ID: 'r-1' } },
          ),
        ]),
        skills, rules,
      );

      expect(spec.nugget.goal).toBe('Build a platformer game');
      expect(spec.nugget.type).toBe('game');
      expect(spec.requirements).toHaveLength(4);
      expect(spec.requirements.map(r => r.type)).toEqual(['feature', 'feature', 'constraint', 'data']);
      expect(spec.style).toEqual({ visual: 'fun_colorful', personality: 'upbeat and encouraging' });
      expect(spec.agents).toHaveLength(2);
      expect(spec.workflow.testing_enabled).toBe(true);
      expect(spec.workflow.review_enabled).toBe(true);
      expect(spec.workflow.iteration_conditions).toEqual(['fun to play']);
      expect(spec.workflow.human_gates).toEqual(['publishing']);
      expect(spec.deployment.target).toBe('web');
      expect(spec.skills).toHaveLength(1);
      expect(spec.rules).toHaveLength(1);
    });

    it('hardware workspace with timer and esp32', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'LED blinker' } },
          { type: 'timer_every', fields: { INTERVAL: 2 } },
          { type: 'deploy_esp32' },
          { type: 'agent_builder', fields: { AGENT_NAME: 'HW Dev', AGENT_PERSONA: 'embedded expert' } },
        ),
      ]));

      expect(spec.nugget.goal).toBe('LED blinker');
      expect(spec.nugget.type).toBe('hardware');
      expect(spec.requirements).toContainEqual({ type: 'timer', description: 'Repeat every 2 seconds' });
      expect(spec.deployment.target).toBe('esp32');
      expect(spec.deployment.auto_flash).toBe(true);
      expect(spec.agents).toHaveLength(1);
    });
  });

  describe('migrateWorkspace', () => {
    it('renames project_goal to nugget_goal', () => {
      const ws = makeWorkspace([{ type: 'project_goal', fields: { GOAL_TEXT: 'hi' } }]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].type).toBe('nugget_goal');
    });

    it('renames project_template to nugget_template', () => {
      const ws = makeWorkspace([{ type: 'project_template', fields: { TEMPLATE_TYPE: 'game' } }]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].type).toBe('nugget_template');
    });

    it('renames blocks in next chains', () => {
      const ws = makeWorkspace([{
        type: 'project_goal',
        fields: { GOAL_TEXT: 'hi' },
        next: { block: { type: 'project_template', fields: { TEMPLATE_TYPE: 'game' } } },
      }]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].type).toBe('nugget_goal');
      expect((ws as any).blocks.blocks[0].next.block.type).toBe('nugget_template');
    });

    it('migrates blocks in input chains', () => {
      const ws = makeWorkspace([{
        type: 'first_then',
        inputs: {
          FIRST_BLOCKS: {
            block: { type: 'project_goal', fields: { GOAL_TEXT: 'test' } },
          },
        },
      }]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].inputs.FIRST_BLOCKS.block.type).toBe('nugget_goal');
    });

    it('leaves non-project block types unchanged', () => {
      const ws = makeWorkspace([{ type: 'feature', fields: { FEATURE_TEXT: 'test' } }]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].type).toBe('feature');
    });

    it('returns the same object reference', () => {
      const ws = makeWorkspace([]) as Record<string, unknown>;
      const result = migrateWorkspace(ws);
      expect(result).toBe(ws);
    });

    it('handles workspace with no blocks key', () => {
      const ws = {} as Record<string, unknown>;
      const result = migrateWorkspace(ws);
      expect(result).toBe(ws);
    });

    it('handles workspace with empty blocks object', () => {
      const ws = { blocks: {} } as Record<string, unknown>;
      migrateWorkspace(ws);
      expect(ws).toEqual({ blocks: {} });
    });

    it('migrates multiple top-level blocks', () => {
      const ws = makeWorkspace([
        { type: 'project_goal', fields: { GOAL_TEXT: 'a' } },
        { type: 'project_template', fields: { TEMPLATE_TYPE: 'tool' } },
      ]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].type).toBe('nugget_goal');
      expect((ws as any).blocks.blocks[1].type).toBe('nugget_template');
    });
  });

  // ============================================================
  // New block type extraction tests (Systems Thinking / PRD-001 / PRD-002)
  // ============================================================

  describe('NuggetSpec new optional fields (backward compat)', () => {
    it('existing workspace produces spec without new fields when blocks absent', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'Build a game' } },
          { type: 'feature', fields: { FEATURE_TEXT: 'jump' } },
          { type: 'deploy_web' },
        ),
      ]));
      expect(spec.workflow.feedback_loops).toBeUndefined();
      expect(spec.workflow.system_level).toBeUndefined();
      expect(spec.runtime).toBeUndefined();
      expect(spec.knowledge).toBeUndefined();
      expect(spec.deployment.runtime_url).toBeUndefined();
      expect(spec.deployment.provision_runtime).toBeUndefined();
    });

    it('requirements do not have test_id by default', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'feature', fields: { FEATURE_TEXT: 'login' } }),
      ]));
      expect(spec.requirements[0].test_id).toBeUndefined();
    });
  });

  describe('feedback_loop block (Systems Thinking)', () => {
    it('extracts feedback_loop fields', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'feedback_loop',
          fields: {
            LOOP_ID: 'loop-1',
            TRIGGER: 'test_failure',
            EXIT_CONDITION: 'all tests pass',
            MAX_ITERATIONS: 5,
            CONNECTS_FROM: 'req-1',
            CONNECTS_TO: 'task-1',
          },
        }),
      ]));
      expect(spec.workflow.feedback_loops).toHaveLength(1);
      expect(spec.workflow.feedback_loops![0]).toEqual({
        id: 'loop-1',
        trigger: 'test_failure',
        exit_condition: 'all tests pass',
        max_iterations: 5,
        connects_from: 'req-1',
        connects_to: 'task-1',
      });
    });

    it('accumulates multiple feedback loops', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          {
            type: 'feedback_loop',
            fields: { LOOP_ID: 'loop-1', TRIGGER: 'test_failure', EXIT_CONDITION: 'pass', MAX_ITERATIONS: 3, CONNECTS_FROM: 'r1', CONNECTS_TO: 't1' },
          },
          {
            type: 'feedback_loop',
            fields: { LOOP_ID: 'loop-2', TRIGGER: 'review_rejection', EXIT_CONDITION: 'approved', MAX_ITERATIONS: 2, CONNECTS_FROM: 'r2', CONNECTS_TO: 't2' },
          },
        ),
      ]));
      expect(spec.workflow.feedback_loops).toHaveLength(2);
      expect(spec.workflow.feedback_loops![1].trigger).toBe('review_rejection');
    });

    it('defaults fields when missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'feedback_loop', fields: {} }),
      ]));
      expect(spec.workflow.feedback_loops![0]).toEqual({
        id: '',
        trigger: 'test_failure',
        exit_condition: '',
        max_iterations: 3,
        connects_from: '',
        connects_to: '',
      });
    });
  });

  describe('system_level block (Systems Thinking)', () => {
    it('extracts system_level from block', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'system_level', fields: { LEVEL: 'architect' } }),
      ]));
      expect(spec.workflow.system_level).toBe('architect');
    });

    it('defaults to explorer when field is missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'system_level', fields: {} }),
      ]));
      expect(spec.workflow.system_level).toBe('explorer');
    });

    it('accepts all valid levels', () => {
      for (const level of ['explorer', 'builder', 'architect']) {
        const spec = interpretWorkspace(makeWorkspace([
          goalBlock('Test', { type: 'system_level', fields: { LEVEL: level } }),
        ]));
        expect(spec.workflow.system_level).toBe(level);
      }
    });
  });

  describe('runtime_config block (PRD-001)', () => {
    it('extracts runtime config from block', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'runtime_config',
          fields: {
            AGENT_NAME: 'Coach Bot',
            GREETING: 'Welcome!',
            FALLBACK_RESPONSE: 'Sorry, I cannot help.',
            VOICE: 'alloy',
            DISPLAY_THEME: 'sporty',
          },
        }),
      ]));
      expect(spec.runtime).toEqual({
        agent_name: 'Coach Bot',
        greeting: 'Welcome!',
        fallback_response: 'Sorry, I cannot help.',
        voice: 'alloy',
        display_theme: 'sporty',
      });
    });

    it('omits undefined fields for empty strings', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'runtime_config', fields: { AGENT_NAME: 'Bot' } }),
      ]));
      expect(spec.runtime!.agent_name).toBe('Bot');
      expect(spec.runtime!.greeting).toBeUndefined();
      expect(spec.runtime!.voice).toBeUndefined();
    });

    it('omits all fields when all empty', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'runtime_config', fields: {} }),
      ]));
      expect(spec.runtime).toBeDefined();
      expect(spec.runtime!.agent_name).toBeUndefined();
    });
  });

  describe('agent_backpack block (PRD-001)', () => {
    it('initialises knowledge with empty backpack_sources when present', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'agent_backpack' }),
      ]));
      expect(spec.knowledge).toBeDefined();
      expect(spec.knowledge!.backpack_sources).toEqual([]);
    });

    it('does not overwrite existing backpack_sources', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'backpack_source', fields: { SOURCE_ID: 'src-1', SOURCE_TYPE: 'pdf', TITLE: 'Book' } },
          { type: 'agent_backpack' },
        ),
      ]));
      expect(spec.knowledge!.backpack_sources).toHaveLength(1);
      expect(spec.knowledge!.backpack_sources![0].title).toBe('Book');
    });

    it('knowledge is undefined when agent_backpack block is absent', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'feature', fields: { FEATURE_TEXT: 'something' } }),
      ]));
      expect(spec.knowledge).toBeUndefined();
    });
  });

  describe('backpack_source block (PRD-001)', () => {
    it('extracts backpack source from block', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'backpack_source',
          fields: {
            SOURCE_ID: 'src-1',
            SOURCE_TYPE: 'pdf',
            TITLE: 'Physics Book',
            URI: 'https://example.com/book.pdf',
          },
        }),
      ]));
      expect(spec.knowledge).toBeDefined();
      expect(spec.knowledge!.backpack_sources).toHaveLength(1);
      expect(spec.knowledge!.backpack_sources![0]).toEqual({
        id: 'src-1',
        type: 'pdf',
        title: 'Physics Book',
        uri: 'https://example.com/book.pdf',
      });
    });

    it('accumulates multiple backpack sources', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'backpack_source', fields: { SOURCE_ID: 'src-1', SOURCE_TYPE: 'pdf', TITLE: 'Book' } },
          { type: 'backpack_source', fields: { SOURCE_ID: 'src-2', SOURCE_TYPE: 'youtube', TITLE: 'Video', URI: 'https://youtube.com/watch?v=abc' } },
        ),
      ]));
      expect(spec.knowledge!.backpack_sources).toHaveLength(2);
      expect(spec.knowledge!.backpack_sources![1].type).toBe('youtube');
    });

    it('omits uri when empty', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'backpack_source',
          fields: { SOURCE_ID: 'src-1', SOURCE_TYPE: 'topic_pack', TITLE: 'Math' },
        }),
      ]));
      expect(spec.knowledge!.backpack_sources![0].uri).toBeUndefined();
    });

    it('defaults fields when missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'backpack_source', fields: {} }),
      ]));
      expect(spec.knowledge!.backpack_sources![0]).toEqual({
        id: '',
        type: 'url',
        title: '',
        uri: undefined,
      });
    });
  });

  describe('study_mode block (PRD-001)', () => {
    it('extracts study mode from block', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'study_mode',
          fields: {
            ENABLED: true,
            STYLE: 'quiz_me',
            DIFFICULTY: 'hard',
            QUIZ_FREQUENCY: 3,
          },
        }),
      ]));
      expect(spec.knowledge).toBeDefined();
      expect(spec.knowledge!.study_mode).toEqual({
        enabled: true,
        style: 'quiz_me',
        difficulty: 'hard',
        quiz_frequency: 3,
      });
    });

    it('defaults fields when missing', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'study_mode', fields: {} }),
      ]));
      expect(spec.knowledge!.study_mode).toEqual({
        enabled: true,
        style: 'explain',
        difficulty: 'medium',
        quiz_frequency: 5,
      });
    });

    it('handles string quiz_frequency from Blockly dropdown', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'study_mode',
          fields: {
            STYLE: 'socratic',
            DIFFICULTY: 'easy',
            QUIZ_FREQUENCY: '3',
          },
        }),
      ]));
      expect(spec.knowledge!.study_mode!.quiz_frequency).toBe(3);
      expect(typeof spec.knowledge!.study_mode!.quiz_frequency).toBe('number');
    });

    it('study_mode and backpack_source share knowledge object', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'backpack_source', fields: { SOURCE_ID: 'src-1', SOURCE_TYPE: 'pdf', TITLE: 'Book' } },
          { type: 'study_mode', fields: { ENABLED: true, STYLE: 'flashcards', DIFFICULTY: 'easy', QUIZ_FREQUENCY: 10 } },
        ),
      ]));
      expect(spec.knowledge!.backpack_sources).toHaveLength(1);
      expect(spec.knowledge!.study_mode!.style).toBe('flashcards');
    });
  });

  describe('deploy_runtime block (PRD-002)', () => {
    it('sets provision_runtime and infers web deployment', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'deploy_runtime' }),
      ]));
      expect(spec.deployment.provision_runtime).toBe(true);
      expect(spec.deployment.target).toBe('web');
    });

    it('extracts runtime_url when provided', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'deploy_runtime',
          fields: { RUNTIME_URL: 'https://runtime.example.com' },
        }),
      ]));
      expect(spec.deployment.runtime_url).toBe('https://runtime.example.com');
      expect(spec.deployment.provision_runtime).toBe(true);
    });

    it('does not set runtime_url when field is empty', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'deploy_runtime', fields: {} }),
      ]));
      expect(spec.deployment.runtime_url).toBeUndefined();
      expect(spec.deployment.provision_runtime).toBe(true);
    });

    it('deploy_runtime + deploy_esp32 results in both target', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'deploy_runtime', fields: { RUNTIME_URL: 'https://rt.example.com' } },
          { type: 'deploy_esp32' },
        ),
      ]));
      expect(spec.deployment.target).toBe('both');
      expect(spec.deployment.provision_runtime).toBe(true);
      expect(spec.deployment.runtime_url).toBe('https://rt.example.com');
    });
  });

  describe('nugget_provides block (Composition)', () => {
    it('creates composition.provides entry', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'nugget_provides',
          fields: { INTERFACE_NAME: 'sensor_data', INTERFACE_TYPE: 'stream' },
        }),
      ]));
      expect(spec.composition).toBeDefined();
      expect(spec.composition!.provides).toHaveLength(1);
      expect(spec.composition!.provides![0]).toEqual({ name: 'sensor_data', type: 'stream' });
    });

    it('defaults field values', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'nugget_provides', fields: {} }),
      ]));
      expect(spec.composition!.provides![0]).toEqual({ name: 'user_data', type: 'data' });
    });

    it('accumulates multiple provides', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'nugget_provides', fields: { INTERFACE_NAME: 'api_data', INTERFACE_TYPE: 'data' } },
          { type: 'nugget_provides', fields: { INTERFACE_NAME: 'click_event', INTERFACE_TYPE: 'event' } },
        ),
      ]));
      expect(spec.composition!.provides).toHaveLength(2);
      expect(spec.composition!.provides![0].name).toBe('api_data');
      expect(spec.composition!.provides![1].name).toBe('click_event');
    });
  });

  describe('nugget_requires block (Composition)', () => {
    it('creates composition.requires entry', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'nugget_requires',
          fields: { INTERFACE_NAME: 'auth_token', INTERFACE_TYPE: 'function' },
        }),
      ]));
      expect(spec.composition).toBeDefined();
      expect(spec.composition!.requires).toHaveLength(1);
      expect(spec.composition!.requires![0]).toEqual({ name: 'auth_token', type: 'function' });
    });

    it('defaults field values', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'nugget_requires', fields: {} }),
      ]));
      expect(spec.composition!.requires![0]).toEqual({ name: 'user_data', type: 'data' });
    });

    it('accumulates multiple requires', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'nugget_requires', fields: { INTERFACE_NAME: 'user_profile', INTERFACE_TYPE: 'data' } },
          { type: 'nugget_requires', fields: { INTERFACE_NAME: 'notifications', INTERFACE_TYPE: 'event' } },
        ),
      ]));
      expect(spec.composition!.requires).toHaveLength(2);
      expect(spec.composition!.requires![0].name).toBe('user_profile');
      expect(spec.composition!.requires![1].name).toBe('notifications');
    });
  });

  describe('composition provides and requires coexist', () => {
    it('both provides and requires populate the same composition object', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          { type: 'nugget_provides', fields: { INTERFACE_NAME: 'output_data', INTERFACE_TYPE: 'data' } },
          { type: 'nugget_requires', fields: { INTERFACE_NAME: 'input_config', INTERFACE_TYPE: 'function' } },
        ),
      ]));
      expect(spec.composition).toBeDefined();
      expect(spec.composition!.provides).toHaveLength(1);
      expect(spec.composition!.requires).toHaveLength(1);
      expect(spec.composition!.provides![0]).toEqual({ name: 'output_data', type: 'data' });
      expect(spec.composition!.requires![0]).toEqual({ name: 'input_config', type: 'function' });
    });

    it('composition is undefined when no provides/requires blocks exist', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', { type: 'feature', fields: { FEATURE_TEXT: 'login' } }),
      ]));
      expect(spec.composition).toBeUndefined();
    });
  });

  describe('full workspace with new block types', () => {
    it('combines old and new blocks in a complete workspace', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'Build a study agent' } },
          { type: 'feature', fields: { FEATURE_TEXT: 'quiz mode' } },
          { type: 'system_level', fields: { LEVEL: 'architect' } },
          { type: 'feedback_loop', fields: { LOOP_ID: 'loop-1', TRIGGER: 'test_failure', EXIT_CONDITION: 'all tests pass', MAX_ITERATIONS: 3, CONNECTS_FROM: 'r1', CONNECTS_TO: 't1' } },
          { type: 'when_then', fields: { TRIGGER_TEXT: 'quiz starts', ACTION_TEXT: 'question shown' }, inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'quiz starts', THEN: 'question shown' } } } } },
          { type: 'runtime_config', fields: { AGENT_NAME: 'Study Coach', GREETING: 'Ready to learn?' } },
          { type: 'backpack_source', fields: { SOURCE_ID: 'src-1', SOURCE_TYPE: 'pdf', TITLE: 'Textbook' } },
          { type: 'study_mode', fields: { ENABLED: true, STYLE: 'socratic', DIFFICULTY: 'hard', QUIZ_FREQUENCY: 3 } },
          { type: 'deploy_runtime', fields: { RUNTIME_URL: 'https://rt.example.com' } },
          { type: 'agent_builder', fields: { AGENT_NAME: 'DevBot', AGENT_PERSONA: 'expert builder' } },
        ),
      ]));

      // Core fields still work
      expect(spec.nugget.goal).toBe('Build a study agent');
      expect(spec.requirements).toHaveLength(2); // feature + when_then with socketed test
      expect(spec.agents).toHaveLength(1);
      expect(spec.workflow.testing_enabled).toBe(true);

      // New Systems Thinking fields
      expect(spec.workflow.system_level).toBe('architect');
      expect(spec.workflow.feedback_loops).toHaveLength(1);
      expect(spec.workflow.feedback_loops![0].id).toBe('loop-1');

      // New PRD-001 fields
      expect(spec.runtime!.agent_name).toBe('Study Coach');
      expect(spec.runtime!.greeting).toBe('Ready to learn?');
      expect(spec.knowledge!.backpack_sources).toHaveLength(1);
      expect(spec.knowledge!.study_mode!.style).toBe('socratic');

      // New PRD-002 fields
      expect(spec.deployment.provision_runtime).toBe(true);
      expect(spec.deployment.runtime_url).toBe('https://rt.example.com');
      expect(spec.deployment.target).toBe('web');
    });
  });
});
