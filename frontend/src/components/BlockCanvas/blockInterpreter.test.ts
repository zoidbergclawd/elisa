import { describe, it, expect } from 'vitest';
import { interpretWorkspace, migrateWorkspace, type NuggetSpec } from './blockInterpreter';
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

describe('blockInterpreter', () => {
  it('returns empty spec when no goal block', () => {
    const spec = interpretWorkspace(makeWorkspace([]));
    expect(spec.nugget.goal).toBe('');
  });

  it('parses nugget_goal', () => {
    const spec = interpretWorkspace(makeWorkspace([goalBlock('Build a game')]));
    expect(spec.nugget.goal).toBe('Build a game');
  });

  it('parses nugget_template', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('My nugget', { type: 'nugget_template', fields: { TEMPLATE_TYPE: 'game' } }),
    ]));
    expect(spec.nugget.type).toBe('game');
  });

  it('parses constraint block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'constraint', fields: { CONSTRAINT_TEXT: 'crash' } }),
    ]));
    expect(spec.requirements).toContainEqual({ type: 'constraint', description: 'crash' });
  });

  it('parses when_then block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'when_then', fields: { TRIGGER_TEXT: 'click', ACTION_TEXT: 'jump' } }),
    ]));
    expect(spec.requirements[0].type).toBe('when_then');
    expect(spec.requirements[0].description).toContain('click');
    expect(spec.requirements[0].description).toContain('jump');
  });

  it('parses has_data block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'has_data', fields: { DATA_TEXT: 'user scores' } }),
    ]));
    expect(spec.requirements).toContainEqual({ type: 'data', description: 'user scores' });
  });

  it('parses look_like block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'look_like', fields: { STYLE_PRESET: 'dark_techy' } }),
    ]));
    expect(spec.style?.visual).toBe('dark_techy');
  });

  it('parses personality block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'personality', fields: { PERSONALITY_TEXT: 'sarcastic' } }),
    ]));
    expect(spec.style?.personality).toBe('sarcastic');
  });

  it('parses agent_reviewer block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'agent_reviewer', fields: { AGENT_NAME: 'Rev', AGENT_PERSONA: 'strict' } }),
    ]));
    expect(spec.agents).toContainEqual({ name: 'Rev', role: 'reviewer', persona: 'strict' });
    expect(spec.workflow.review_enabled).toBe(true);
  });

  it('parses agent_custom block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'agent_custom', fields: { AGENT_NAME: 'Doc', AGENT_PERSONA: 'writes docs' } }),
    ]));
    expect(spec.agents).toContainEqual({ name: 'Doc', role: 'custom', persona: 'writes docs' });
  });

  it('parses check_with_me block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'check_with_me', fields: { GATE_DESCRIPTION: 'deploying' } }),
    ]));
    expect(spec.workflow.human_gates).toContain('deploying');
    expect(spec.workflow.review_enabled).toBe(true);
  });

  it('parses keep_improving block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'keep_improving', fields: { CONDITION_TEXT: 'all tests pass' } }),
    ]));
    expect(spec.workflow.iteration_conditions).toContain('all tests pass');
  });

  it('parses first_then container block with flow hints', () => {
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
    expect(spec.workflow.flow_hints![0].descriptions).toContain('build UI');
    expect(spec.workflow.flow_hints![0].descriptions).toContain('add tests');
  });

  it('parses at_same_time container block with flow hints', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', {
        type: 'at_same_time',
        inputs: {
          PARALLEL_BLOCKS: { block: { type: 'feature', fields: { FEATURE_TEXT: 'feature A' } } },
        },
      }),
    ]));
    expect(spec.workflow.flow_hints).toHaveLength(1);
    expect(spec.workflow.flow_hints![0].type).toBe('parallel');
  });

  // Hardware blocks
  it('parses led_control block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'led_control', fields: { LED_ACTION: 'blink', LED_SPEED: 'fast' } }),
    ]));
    expect(spec.hardware?.components).toContainEqual({ type: 'led', action: 'blink', speed: 'fast' });
  });

  it('parses button_input block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'button_input', fields: { PIN: 14 } }),
    ]));
    expect(spec.hardware?.components).toContainEqual({ type: 'button', pin: 14 });
  });

  it('parses sensor_read block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'sensor_read', fields: { SENSOR_TYPE: 'light' } }),
    ]));
    expect(spec.hardware?.components).toContainEqual({ type: 'sensor', sensor_type: 'light' });
  });

  it('parses lora_send block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'lora_send', fields: { MESSAGE: 'hello', CHANNEL: 3 } }),
    ]));
    expect(spec.hardware?.components).toContainEqual({ type: 'lora_send', message: 'hello', channel: 3 });
  });

  it('parses lora_receive block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'lora_receive', fields: { CHANNEL: 2 } }),
    ]));
    expect(spec.hardware?.components).toContainEqual({ type: 'lora_receive', channel: 2 });
  });

  it('parses timer_every block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'timer_every', fields: { INTERVAL: 10 } }),
    ]));
    expect(spec.hardware?.components).toContainEqual({ type: 'timer', interval: 10 });
  });

  it('parses buzzer_play block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'buzzer_play', fields: { FREQUENCY: 440, DURATION: 1.0 } }),
    ]));
    expect(spec.hardware?.components).toContainEqual({ type: 'buzzer', frequency: 440, duration: 1.0 });
  });

  it('parses deploy_both block', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'deploy_both' }),
    ]));
    expect(spec.deployment.target).toBe('both');
  });

  it('hardware blocks set hasEsp32', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('Test', { type: 'led_control', fields: { LED_ACTION: 'on', LED_SPEED: 'normal' } }),
    ]));
    expect(spec.deployment.target).toBe('esp32');
    expect(spec.deployment.auto_flash).toBe(true);
  });

  it('initializes flow_hints and iteration_conditions', () => {
    const spec = interpretWorkspace(makeWorkspace([goalBlock('Test')]));
    expect(spec.workflow.flow_hints).toEqual([]);
    expect(spec.workflow.iteration_conditions).toEqual([]);
  });

  // Skills and Rules blocks
  it('parses use_skill block and resolves skill from array', () => {
    const skills: Skill[] = [
      { id: 'skill-1', name: 'Be Creative', prompt: 'Use bright colors', category: 'style' },
    ];
    const spec = interpretWorkspace(
      makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: 'skill-1' } })]),
      skills,
    );
    expect(spec.skills).toHaveLength(1);
    expect(spec.skills![0]).toEqual({
      id: 'skill-1',
      name: 'Be Creative',
      prompt: 'Use bright colors',
      category: 'style',
    });
  });

  it('parses use_rule block and resolves rule from array', () => {
    const rules: Rule[] = [
      { id: 'rule-1', name: 'Always Comment', prompt: 'Add comments everywhere', trigger: 'always' },
    ];
    const spec = interpretWorkspace(
      makeWorkspace([goalBlock('Test', { type: 'use_rule', fields: { RULE_ID: 'rule-1' } })]),
      undefined,
      rules,
    );
    expect(spec.rules).toHaveLength(1);
    expect(spec.rules![0]).toEqual({
      id: 'rule-1',
      name: 'Always Comment',
      prompt: 'Add comments everywhere',
      trigger: 'always',
    });
  });

  it('ignores use_skill with unknown ID', () => {
    const skills: Skill[] = [
      { id: 'skill-1', name: 'Be Creative', prompt: 'Use bright colors', category: 'style' },
    ];
    const spec = interpretWorkspace(
      makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: 'nonexistent' } })]),
      skills,
    );
    expect(spec.skills).toBeUndefined();
  });

  it('ignores use_rule with unknown ID', () => {
    const rules: Rule[] = [
      { id: 'rule-1', name: 'Always Comment', prompt: 'Add comments', trigger: 'always' },
    ];
    const spec = interpretWorkspace(
      makeWorkspace([goalBlock('Test', { type: 'use_rule', fields: { RULE_ID: 'nonexistent' } })]),
      undefined,
      rules,
    );
    expect(spec.rules).toBeUndefined();
  });

  it('ignores use_skill when no skills array provided', () => {
    const spec = interpretWorkspace(
      makeWorkspace([goalBlock('Test', { type: 'use_skill', fields: { SKILL_ID: 'skill-1' } })]),
    );
    expect(spec.skills).toBeUndefined();
  });

  // Portal blocks
  describe('portal blocks', () => {
    const portals: Portal[] = [
      {
        id: 'portal-1',
        name: 'My ESP32',
        description: 'An ESP32 board',
        mechanism: 'serial',
        status: 'unconfigured',
        capabilities: [
          { id: 'led-on', name: 'LED on', kind: 'action', description: 'Turn LED on' },
          { id: 'btn-press', name: 'Button pressed', kind: 'event', description: 'Button event' },
          { id: 'read-temp', name: 'Read temperature', kind: 'query', description: 'Read temp sensor' },
        ],
        serialConfig: { baudRate: 115200, boardType: 'esp32' },
      },
    ];

    it('parses portal_tell block and creates portal entry with interaction', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'led-on' } })]),
        undefined,
        undefined,
        portals,
      );
      expect(spec.portals).toHaveLength(1);
      expect(spec.portals![0].name).toBe('My ESP32');
      expect(spec.portals![0].mechanism).toBe('serial');
      expect(spec.portals![0].interactions).toContainEqual({ type: 'tell', capabilityId: 'led-on' });
    });

    it('parses portal_when block', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_when', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'btn-press' } })]),
        undefined,
        undefined,
        portals,
      );
      expect(spec.portals).toHaveLength(1);
      expect(spec.portals![0].interactions).toContainEqual({ type: 'when', capabilityId: 'btn-press' });
    });

    it('parses portal_ask block', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_ask', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'read-temp' } })]),
        undefined,
        undefined,
        portals,
      );
      expect(spec.portals).toHaveLength(1);
      expect(spec.portals![0].interactions).toContainEqual({ type: 'ask', capabilityId: 'read-temp' });
    });

    it('groups multiple interactions for the same portal', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', {
          type: 'portal_tell',
          fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'led-on' },
          next: { block: { type: 'portal_ask', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'read-temp' } } },
        })]),
        undefined,
        undefined,
        portals,
      );
      expect(spec.portals).toHaveLength(1);
      expect(spec.portals![0].interactions).toHaveLength(2);
      expect(spec.portals![0].interactions[0]).toEqual({ type: 'tell', capabilityId: 'led-on' });
      expect(spec.portals![0].interactions[1]).toEqual({ type: 'ask', capabilityId: 'read-temp' });
    });

    it('ignores portal block with unknown portal ID', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'nonexistent', CAPABILITY_ID: 'led-on' } })]),
        undefined,
        undefined,
        portals,
      );
      expect(spec.portals).toBeUndefined();
    });

    it('ignores portal block when no portals array provided', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'led-on' } })]),
      );
      expect(spec.portals).toBeUndefined();
    });

    it('includes serialConfig in portal entry', () => {
      const spec = interpretWorkspace(
        makeWorkspace([goalBlock('Test', { type: 'portal_tell', fields: { PORTAL_ID: 'portal-1', CAPABILITY_ID: 'led-on' } })]),
        undefined,
        undefined,
        portals,
      );
      expect(spec.portals![0].serialConfig).toEqual({ baudRate: 115200, boardType: 'esp32' });
    });
  });

  describe('migrateWorkspace', () => {
    it('renames project_goal to nugget_goal', () => {
      const ws = makeWorkspace([{ type: 'project_goal', fields: { GOAL_TEXT: 'hi' } }]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].type).toBe('nugget_goal');
    });

    it('renames project_template in next chain', () => {
      const ws = makeWorkspace([{
        type: 'project_goal',
        fields: { GOAL_TEXT: 'hi' },
        next: { block: { type: 'project_template', fields: { TEMPLATE_TYPE: 'game' } } },
      }]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].type).toBe('nugget_goal');
      expect((ws as any).blocks.blocks[0].next.block.type).toBe('nugget_template');
    });

    it('leaves non-project block types unchanged', () => {
      const ws = makeWorkspace([{ type: 'feature', fields: { FEATURE_TEXT: 'test' } }]);
      migrateWorkspace(ws as Record<string, unknown>);
      expect((ws as any).blocks.blocks[0].type).toBe('feature');
    });

    it('handles empty workspace', () => {
      const ws = { blocks: {} };
      migrateWorkspace(ws as Record<string, unknown>);
      expect(ws).toEqual({ blocks: {} });
    });
  });
});
