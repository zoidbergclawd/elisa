import { describe, it, expect } from 'vitest';
import { interpretWorkspace, type ProjectSpec } from './blockInterpreter';

function makeWorkspace(blocks: unknown[]) {
  return { blocks: { blocks } };
}

function goalBlock(text: string, next?: unknown) {
  return {
    type: 'project_goal',
    fields: { GOAL_TEXT: text },
    ...(next ? { next: { block: next } } : {}),
  };
}

describe('blockInterpreter', () => {
  it('returns empty spec when no goal block', () => {
    const spec = interpretWorkspace(makeWorkspace([]));
    expect(spec.project.goal).toBe('');
  });

  it('parses project_goal', () => {
    const spec = interpretWorkspace(makeWorkspace([goalBlock('Build a game')]));
    expect(spec.project.goal).toBe('Build a game');
  });

  it('parses project_template', () => {
    const spec = interpretWorkspace(makeWorkspace([
      goalBlock('My project', { type: 'project_template', fields: { TEMPLATE_TYPE: 'game' } }),
    ]));
    expect(spec.project.type).toBe('game');
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
});
