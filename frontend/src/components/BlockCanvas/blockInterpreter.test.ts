/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { interpretWorkspace, migrateWorkspace } from './blockInterpreter';
import type { Skill } from '../Skills/types';
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

  describe('proof block (renamed from behavioral_test)', () => {
    it('produces workflow.behavioral_tests when socketed into when_then', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'when_then',
          fields: { TRIGGER_TEXT: 'click play', ACTION_TEXT: 'game starts' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'the user clicks play', THEN: 'the game starts' } } } },
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

    it('enables testing when proof is socketed', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'when_then',
          fields: { TRIGGER_TEXT: 'click', ACTION_TEXT: 'response' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'click', THEN: 'response' } } } },
        }),
      ]));
      expect(spec.workflow.testing_enabled).toBe(true);
    });

    it('accumulates multiple proofs across when_then blocks', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
          {
            type: 'when_then',
            fields: { TRIGGER_TEXT: 'click play', ACTION_TEXT: 'game starts' },
            inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'click play', THEN: 'game starts' } } } },
          },
          {
            type: 'when_then',
            fields: { TRIGGER_TEXT: 'click stop', ACTION_TEXT: 'game pauses' },
            inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'click stop', THEN: 'game pauses' } } } },
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
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: {} } } },
        }),
      ]));
      expect(spec.workflow.behavioral_tests![0]).toMatchObject({ when: '', then: '' });
    });

    it('behavioral_tests is undefined when no proof blocks exist', () => {
      const spec = interpretWorkspace(makeWorkspace([goalBlock('Test')]));
      expect(spec.workflow.behavioral_tests).toBeUndefined();
    });

    it('links test_id on requirement to socketed proof', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'when_then',
          fields: { TRIGGER_TEXT: 'click', ACTION_TEXT: 'jump' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'click', THEN: 'jump' } } } },
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

    it('legacy behavioral_test type still works (backward compat)', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'when_then',
          fields: { TRIGGER_TEXT: 'click', ACTION_TEXT: 'jump' },
          inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'click', THEN: 'jump' } } } },
        }),
      ]));
      expect(spec.workflow.behavioral_tests).toHaveLength(1);
      expect(spec.workflow.testing_enabled).toBe(true);
    });
  });

  describe('feature block TEST_SOCKET', () => {
    it('produces behavioral_tests when proof socketed into feature', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'feature',
          fields: { FEATURE_TEXT: 'play music' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'user presses play', THEN: 'music plays' } } } },
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

    it('enables testing when proof socketed into feature', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'feature',
          fields: { FEATURE_TEXT: 'play music' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'play', THEN: 'music' } } } },
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

    it('links test_id on feature requirement to socketed proof', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'feature',
          fields: { FEATURE_TEXT: 'play music' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'press play', THEN: 'music starts' } } } },
        }),
      ]));
      expect(spec.requirements[0].test_id).toBe('test_0');
      expect(spec.workflow.behavioral_tests![0].requirement_id).toBe('req_0');
    });
  });

  describe('has_data block TEST_SOCKET', () => {
    it('produces behavioral_tests when proof socketed into has_data', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'has_data',
          fields: { DATA_TEXT: 'user scores' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'game ends', THEN: 'score is saved' } } } },
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

    it('enables testing when proof socketed into has_data', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'has_data',
          fields: { DATA_TEXT: 'user scores' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'game ends', THEN: 'score saved' } } } },
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

    it('links test_id on has_data requirement to socketed proof', () => {
      const spec = interpretWorkspace(makeWorkspace([
        goalBlock('Test', {
          type: 'has_data',
          fields: { DATA_TEXT: 'user scores' },
          inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'game ends', THEN: 'score persisted' } } } },
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

      const spec = interpretWorkspace(
        makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'Build a platformer game' } },
            { type: 'nugget_template', fields: { TEMPLATE_TYPE: 'game' } },
            { type: 'feature', fields: { FEATURE_TEXT: 'jump and run' } },
            { type: 'feature', fields: { FEATURE_TEXT: 'collect coins' } },
            { type: 'constraint', fields: { CONSTRAINT_TEXT: 'lag or stutter' } },
            { type: 'has_data', fields: { DATA_TEXT: 'level layouts' } },
            { type: 'deploy_web' },
            { type: 'use_skill', fields: { SKILL_ID: 'sk-1' } },
          ),
        ]),
        skills,
      );

      expect(spec.nugget.goal).toBe('Build a platformer game');
      expect(spec.nugget.type).toBe('game');
      expect(spec.requirements).toHaveLength(4);
      expect(spec.requirements.map(r => r.type)).toEqual(['feature', 'feature', 'constraint', 'data']);
      expect(spec.deployment.target).toBe('web');
      expect(spec.skills).toHaveLength(1);
    });

    it('hardware workspace with esp32', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'LED blinker' } },
          { type: 'deploy_esp32' },
        ),
      ]));

      expect(spec.nugget.goal).toBe('LED blinker');
      expect(spec.nugget.type).toBe('hardware');
      expect(spec.deployment.target).toBe('esp32');
      expect(spec.deployment.auto_flash).toBe(true);
    });
  });

  describe('migrateWorkspace', () => {
    it('renames project_goal to nugget_goal', () => {
      const ws = makeWorkspace([{ type: 'project_goal', fields: { GOAL_TEXT: 'hi' } }]);
      const { json: result } = migrateWorkspace(ws as Record<string, unknown>);
      expect((result as any).blocks.blocks[0].type).toBe('nugget_goal');
    });

    it('renames project_template to nugget_template', () => {
      const ws = makeWorkspace([{ type: 'project_template', fields: { TEMPLATE_TYPE: 'game' } }]);
      const { json: result } = migrateWorkspace(ws as Record<string, unknown>);
      expect((result as any).blocks.blocks[0].type).toBe('nugget_template');
    });

    it('renames blocks in next chains', () => {
      const ws = makeWorkspace([{
        type: 'project_goal',
        fields: { GOAL_TEXT: 'hi' },
        next: { block: { type: 'project_template', fields: { TEMPLATE_TYPE: 'game' } } },
      }]);
      const { json: result } = migrateWorkspace(ws as Record<string, unknown>);
      expect((result as any).blocks.blocks[0].type).toBe('nugget_goal');
      expect((result as any).blocks.blocks[0].next.block.type).toBe('nugget_template');
    });

    it('leaves non-project block types unchanged', () => {
      const ws = makeWorkspace([{ type: 'feature', fields: { FEATURE_TEXT: 'test' } }]);
      const { json: result } = migrateWorkspace(ws as Record<string, unknown>);
      expect((result as any).blocks.blocks[0].type).toBe('feature');
    });

    it('returns the same json object reference', () => {
      const ws = makeWorkspace([]) as Record<string, unknown>;
      const { json } = migrateWorkspace(ws);
      expect(json).toBe(ws);
    });

    it('handles workspace with no blocks key', () => {
      const ws = {} as Record<string, unknown>;
      const { json } = migrateWorkspace(ws);
      expect(json).toBe(ws);
    });

    it('handles workspace with empty blocks object', () => {
      const ws = { blocks: {} } as Record<string, unknown>;
      const { json } = migrateWorkspace(ws);
      expect(json).toEqual({ blocks: {} });
    });

    it('migrates multiple top-level blocks', () => {
      const ws = makeWorkspace([
        { type: 'project_goal', fields: { GOAL_TEXT: 'a' } },
        { type: 'project_template', fields: { TEMPLATE_TYPE: 'tool' } },
      ]);
      const { json: result } = migrateWorkspace(ws as Record<string, unknown>);
      expect((result as any).blocks.blocks[0].type).toBe('nugget_goal');
      expect((result as any).blocks.blocks[1].type).toBe('nugget_template');
    });

    it('returns empty warnings array when no migration needed', () => {
      const ws = makeWorkspace([{ type: 'feature', fields: { FEATURE_TEXT: 'test' } }]);
      const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
      expect(warnings).toEqual([]);
    });

    describe('PRD-003 migrations', () => {
      it('renames behavioral_test to proof', () => {
        const ws = makeWorkspace([{
          type: 'nugget_goal',
          fields: { GOAL_TEXT: 'test' },
          next: {
            block: {
              type: 'feature',
              fields: { FEATURE_TEXT: 'login' },
              inputs: { TEST_SOCKET: { block: { type: 'behavioral_test', fields: { GIVEN_WHEN: 'click', THEN: 'login' } } } },
            },
          },
        }]);
        const { json: result } = migrateWorkspace(ws as Record<string, unknown>);
        const featureBlock = (result as any).blocks.blocks[0].next.block;
        expect(featureBlock.inputs.TEST_SOCKET.block.type).toBe('proof');
      });

      it('strips removed blocks from chains', () => {
        const ws = makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } } as Record<string, unknown>,
            { type: 'look_like', fields: { STYLE_PRESET: 'dark' } } as Record<string, unknown>,
            { type: 'feature', fields: { FEATURE_TEXT: 'login' } } as Record<string, unknown>,
          ),
        ]);
        const { json: result } = migrateWorkspace(ws as Record<string, unknown>);
        // look_like should be stripped; goal -> feature directly
        const goalBlock = (result as any).blocks.blocks[0];
        expect(goalBlock.type).toBe('nugget_goal');
        expect(goalBlock.next.block.type).toBe('feature');
      });

      it('strips removed top-level blocks entirely', () => {
        const ws = makeWorkspace([
          { type: 'agent_builder', fields: { AGENT_NAME: 'Bot', AGENT_PERSONA: 'test' } },
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } },
        ]);
        const { json: result } = migrateWorkspace(ws as Record<string, unknown>);
        expect((result as any).blocks.blocks).toHaveLength(1);
        expect((result as any).blocks.blocks[0].type).toBe('nugget_goal');
      });

      it('generates warnings for stripped style blocks', () => {
        const ws = makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } } as Record<string, unknown>,
            { type: 'look_like', fields: { STYLE_PRESET: 'dark' } } as Record<string, unknown>,
            { type: 'personality', fields: { PERSONALITY_TEXT: 'calm' } } as Record<string, unknown>,
          ),
        ]);
        const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
        expect(warnings).toHaveLength(2);
        expect(warnings[0].blockType).toBe('look_like');
        expect(warnings[0].message).toContain('Style blocks');
        expect(warnings[1].blockType).toBe('personality');
      });

      it('generates warnings for stripped flow blocks', () => {
        const ws = makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } } as Record<string, unknown>,
            { type: 'first_then' } as Record<string, unknown>,
          ),
        ]);
        const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].blockType).toBe('first_then');
        expect(warnings[0].message).toContain('Flow blocks');
      });

      it('generates warnings for stripped agent blocks', () => {
        const ws = makeWorkspace([
          { type: 'agent_builder', fields: { AGENT_NAME: 'Bot', AGENT_PERSONA: 'test' } },
        ]);
        const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].blockType).toBe('agent_builder');
        expect(warnings[0].message).toContain('Minion blocks');
      });

      it('generates warnings for stripped rule blocks', () => {
        const ws = makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } } as Record<string, unknown>,
            { type: 'use_rule', fields: { RULE_ID: 'r-1' } } as Record<string, unknown>,
          ),
        ]);
        const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].blockType).toBe('use_rule');
        expect(warnings[0].message).toContain('Rule blocks');
      });

      it('generates warnings for stripped team blocks', () => {
        const ws = makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } } as Record<string, unknown>,
            { type: 'team_member', fields: { MEETING_TYPE: 'media-agent' } } as Record<string, unknown>,
          ),
        ]);
        const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].blockType).toBe('team_member');
        expect(warnings[0].message).toContain('Team blocks');
      });

      it('generates warnings for stripped knowledge blocks', () => {
        const ws = makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } } as Record<string, unknown>,
            { type: 'backpack_source', fields: { SOURCE_ID: 'src-1', SOURCE_TYPE: 'pdf', TITLE: 'Book' } } as Record<string, unknown>,
            { type: 'study_mode', fields: { ENABLED: true } } as Record<string, unknown>,
          ),
        ]);
        const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
        expect(warnings).toHaveLength(2);
        expect(warnings[0].blockType).toBe('backpack_source');
        expect(warnings[0].message).toContain('Knowledge blocks');
        expect(warnings[1].blockType).toBe('study_mode');
        expect(warnings[1].message).toContain('Knowledge blocks');
      });

      it('generates warnings for stripped composition blocks', () => {
        const ws = makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } } as Record<string, unknown>,
            { type: 'nugget_provides', fields: { INTERFACE_NAME: 'data', INTERFACE_TYPE: 'stream' } } as Record<string, unknown>,
          ),
        ]);
        const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].blockType).toBe('nugget_provides');
        expect(warnings[0].message).toContain('Composition blocks');
      });

      it('generates warnings for stripped system_level block', () => {
        const ws = makeWorkspace([
          chainBlocks(
            { type: 'nugget_goal', fields: { GOAL_TEXT: 'test' } } as Record<string, unknown>,
            { type: 'system_level', fields: { LEVEL: 'architect' } } as Record<string, unknown>,
          ),
        ]);
        const { warnings } = migrateWorkspace(ws as Record<string, unknown>);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].blockType).toBe('system_level');
        expect(warnings[0].message).toContain('System level block');
      });
    });
  });

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

  describe('full workspace with new block types', () => {
    it('combines old and new blocks in a complete workspace', () => {
      const spec = interpretWorkspace(makeWorkspace([
        chainBlocks(
          { type: 'nugget_goal', fields: { GOAL_TEXT: 'Build a study agent' } },
          { type: 'feature', fields: { FEATURE_TEXT: 'quiz mode' } },
          { type: 'when_then', fields: { TRIGGER_TEXT: 'quiz starts', ACTION_TEXT: 'question shown' }, inputs: { TEST_SOCKET: { block: { type: 'proof', fields: { GIVEN_WHEN: 'quiz starts', THEN: 'question shown' } } } } },
          { type: 'runtime_config', fields: { AGENT_NAME: 'Study Coach', GREETING: 'Ready to learn?' } },
          { type: 'deploy_runtime', fields: { RUNTIME_URL: 'https://rt.example.com' } },
        ),
      ]));

      // Core fields still work
      expect(spec.nugget.goal).toBe('Build a study agent');
      expect(spec.requirements).toHaveLength(2); // feature + when_then with socketed test
      expect(spec.workflow.testing_enabled).toBe(true);

      // PRD-001 fields
      expect(spec.runtime!.agent_name).toBe('Study Coach');
      expect(spec.runtime!.greeting).toBe('Ready to learn?');

      // PRD-002 fields
      expect(spec.deployment.provision_runtime).toBe(true);
      expect(spec.deployment.runtime_url).toBe('https://rt.example.com');
      expect(spec.deployment.target).toBe('web');
    });
  });
});
