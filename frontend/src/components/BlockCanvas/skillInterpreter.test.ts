import { describe, it, expect } from 'vitest';
import { interpretSkillWorkspace } from './skillInterpreter';
import type { AskUserStep, BranchStep, RunAgentStep, SetContextStep, OutputStep, InvokeSkillStep } from '../Skills/types';

function makeWorkspace(blocks: unknown[]) {
  return { blocks: { blocks } };
}

function startBlock(next?: unknown) {
  return {
    type: 'skill_flow_start',
    ...(next ? { next: { block: next } } : {}),
  };
}

describe('skillInterpreter', () => {
  it('returns empty plan when no start block', () => {
    const plan = interpretSkillWorkspace(makeWorkspace([]), 'skill-1', 'Test');
    expect(plan.steps).toEqual([]);
    expect(plan.skillId).toBe('skill-1');
    expect(plan.skillName).toBe('Test');
  });

  it('returns empty plan when start block has no children', () => {
    const plan = interpretSkillWorkspace(makeWorkspace([startBlock()]), 'skill-1', 'Test');
    expect(plan.steps).toEqual([]);
  });

  it('parses skill_ask_user block', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_ask_user',
        fields: {
          QUESTION: 'What type?',
          HEADER: 'Type',
          OPTIONS: 'Sales, Technical, Update',
          STORE_AS: 'deck_type',
        },
      })]),
      'skill-1',
      'Test',
    );
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0] as AskUserStep;
    expect(step.type).toBe('ask_user');
    expect(step.question).toBe('What type?');
    expect(step.header).toBe('Type');
    expect(step.options).toEqual(['Sales', 'Technical', 'Update']);
    expect(step.storeAs).toBe('deck_type');
  });

  it('parses skill_branch_if with nested blocks', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_branch_if',
        fields: { CONTEXT_KEY: 'deck_type', MATCH_VALUE: 'Sales' },
        inputs: {
          THEN_BLOCKS: {
            block: {
              type: 'skill_ask_user',
              fields: {
                QUESTION: 'What product?',
                HEADER: 'Product',
                OPTIONS: 'A, B',
                STORE_AS: 'product',
              },
            },
          },
        },
      })]),
      'skill-1',
      'Test',
    );
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0] as BranchStep;
    expect(step.type).toBe('branch');
    expect(step.contextKey).toBe('deck_type');
    expect(step.matchValue).toBe('Sales');
    expect(step.thenSteps).toHaveLength(1);
    expect(step.thenSteps[0].type).toBe('ask_user');
  });

  it('parses skill_invoke block', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_invoke',
        fields: { SKILL_ID: 'other-skill', STORE_AS: 'result' },
      })]),
      'skill-1',
      'Test',
    );
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0] as InvokeSkillStep;
    expect(step.type).toBe('invoke_skill');
    expect(step.skillId).toBe('other-skill');
    expect(step.storeAs).toBe('result');
  });

  it('parses skill_run_agent block', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_run_agent',
        fields: { PROMPT: 'Build a {{deck_type}} deck', STORE_AS: 'agent_result' },
      })]),
      'skill-1',
      'Test',
    );
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0] as RunAgentStep;
    expect(step.type).toBe('run_agent');
    expect(step.prompt).toBe('Build a {{deck_type}} deck');
    expect(step.storeAs).toBe('agent_result');
  });

  it('parses skill_set_context block', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_set_context',
        fields: { KEY: 'format', VALUE: 'pptx' },
      })]),
      'skill-1',
      'Test',
    );
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0] as SetContextStep;
    expect(step.type).toBe('set_context');
    expect(step.key).toBe('format');
    expect(step.value).toBe('pptx');
  });

  it('parses skill_output block', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_output',
        fields: { TEMPLATE: 'Done: {{agent_result}}' },
      })]),
      'skill-1',
      'Test',
    );
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0] as OutputStep;
    expect(step.type).toBe('output');
    expect(step.template).toBe('Done: {{agent_result}}');
  });

  it('parses a full multi-step chain', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_ask_user',
        fields: { QUESTION: 'What type?', HEADER: 'Type', OPTIONS: 'A, B', STORE_AS: 'choice' },
        next: {
          block: {
            type: 'skill_run_agent',
            fields: { PROMPT: 'Do {{choice}}', STORE_AS: 'result' },
            next: {
              block: {
                type: 'skill_output',
                fields: { TEMPLATE: '{{result}}' },
              },
            },
          },
        },
      })]),
      'skill-1',
      'Test',
    );
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].type).toBe('ask_user');
    expect(plan.steps[1].type).toBe('run_agent');
    expect(plan.steps[2].type).toBe('output');
  });

  it('ignores unknown block types', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'some_unknown_block',
        fields: {},
        next: {
          block: {
            type: 'skill_output',
            fields: { TEMPLATE: 'done' },
          },
        },
      })]),
      'skill-1',
      'Test',
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].type).toBe('output');
  });

  it('handles empty options string', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_ask_user',
        fields: { QUESTION: 'Q', HEADER: 'H', OPTIONS: '', STORE_AS: 'x' },
      })]),
      'skill-1',
      'Test',
    );
    const step = plan.steps[0] as AskUserStep;
    expect(step.options).toEqual([]);
  });

  it('branch with no nested blocks produces empty thenSteps', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([startBlock({
        type: 'skill_branch_if',
        fields: { CONTEXT_KEY: 'x', MATCH_VALUE: 'y' },
      })]),
      'skill-1',
      'Test',
    );
    const step = plan.steps[0] as BranchStep;
    expect(step.thenSteps).toEqual([]);
  });

  it('uses block id when present', () => {
    const plan = interpretSkillWorkspace(
      makeWorkspace([{
        type: 'skill_flow_start',
        next: {
          block: {
            type: 'skill_set_context',
            id: 'my-custom-id',
            fields: { KEY: 'k', VALUE: 'v' },
          },
        },
      }]),
      'skill-1',
      'Test',
    );
    expect(plan.steps[0].id).toBe('my-custom-id');
  });
});
