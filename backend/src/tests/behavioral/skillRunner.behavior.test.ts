/** Behavioral tests for the SkillRunner.
 *
 * These tests verify step execution order, context threading,
 * question/answer flow, branching, skill invocation, and cycle detection.
 * AgentRunner is mocked; SkillRunner's control flow runs for real.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SkillRunner, resolveTemplate, wrapUserData } from '../../services/skillRunner.js';
import type { SkillPlan, SkillContext, SkillSpec } from '../../models/skillPlan.js';
import { tmpdir } from 'node:os';

// -- Mock AgentRunner --

function createMockAgentRunner(resultSummary = 'Agent completed the task') {
  return {
    execute: vi.fn().mockResolvedValue({
      success: true,
      summary: resultSummary,
      costUsd: 0.01,
      inputTokens: 100,
      outputTokens: 50,
    }),
  } as any;
}

// -- Test helpers --

const TEST_WORKING_DIR = tmpdir();

function createRunner(
  skills: SkillSpec[] = [],
  agentResult = 'Agent completed the task',
) {
  const events: Record<string, any>[] = [];
  const send = vi.fn(async (evt: Record<string, any>) => {
    events.push(evt);
  });
  const agentRunner = createMockAgentRunner(agentResult);
  const runner = new SkillRunner(send, skills, agentRunner, TEST_WORKING_DIR);
  return { runner, events, send, agentRunner };
}

function eventsOfType(events: Record<string, any>[], type: string) {
  return events.filter(e => e.type === type);
}

// -- Tests --

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SkillRunner step execution', () => {
  it('executes an empty plan and returns empty result', async () => {
    const { runner } = createRunner();
    const plan: SkillPlan = { skillId: 's1', skillName: 'Empty', steps: [] };
    const result = await runner.execute(plan);
    expect(result).toBe('');
  });

  it('executes set_context and output steps with template resolution', async () => {
    const { runner, events } = createRunner();
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Test',
      steps: [
        { id: 'step-1', type: 'set_context', key: 'name', value: 'World' },
        { id: 'step-2', type: 'output', template: 'Hello {{name}}!' },
      ],
    };
    const result = await runner.execute(plan);
    expect(result).toBe('Hello World!');

    const outputs = eventsOfType(events, 'skill_output');
    expect(outputs).toHaveLength(1);
    expect(outputs[0].content).toBe('Hello World!');
  });

  it('emits skill_started and skill_completed events', async () => {
    const { runner, events } = createRunner();
    const plan: SkillPlan = { skillId: 's1', skillName: 'Test', steps: [] };
    await runner.execute(plan);

    expect(events[0]).toMatchObject({ type: 'skill_started', skill_id: 's1', skill_name: 'Test' });
    expect(events[events.length - 1]).toMatchObject({ type: 'skill_completed', skill_id: 's1' });
  });

  it('emits skill_step started/completed for each step', async () => {
    const { runner, events } = createRunner();
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Test',
      steps: [
        { id: 'step-1', type: 'set_context', key: 'x', value: 'y' },
      ],
    };
    await runner.execute(plan);

    const stepEvents = eventsOfType(events, 'skill_step');
    expect(stepEvents).toHaveLength(2);
    expect(stepEvents[0]).toMatchObject({ step_id: 'step-1', status: 'started' });
    expect(stepEvents[1]).toMatchObject({ step_id: 'step-1', status: 'completed' });
  });
});

describe('SkillRunner ask_user', () => {
  it('pauses on ask_user and resumes with answer', async () => {
    const { runner, events } = createRunner();
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Test',
      steps: [
        { id: 'step-1', type: 'ask_user', question: 'Pick one', header: 'Choice', options: ['A', 'B'], storeAs: 'choice' },
        { id: 'step-2', type: 'output', template: 'You chose {{choice}}' },
      ],
    };

    // Run in background and answer the question
    const resultPromise = runner.execute(plan);

    // Wait for the question event
    await vi.waitFor(() => {
      expect(events.some(e => e.type === 'skill_question')).toBe(true);
    }, { timeout: 2000 });

    const questionEvt = events.find(e => e.type === 'skill_question')!;
    expect(questionEvt.questions[0].question).toBe('Pick one');

    // Answer it
    runner.respondToQuestion('step-1', { Choice: 'B' });

    const result = await resultPromise;
    expect(result).toBe('You chose B');
  });
});

describe('SkillRunner branching', () => {
  it('executes matching branch and skips non-matching', async () => {
    const { runner } = createRunner();
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Test',
      steps: [
        { id: 'step-1', type: 'set_context', key: 'color', value: 'red' },
        {
          id: 'step-2',
          type: 'branch',
          contextKey: 'color',
          matchValue: 'blue',
          thenSteps: [
            { id: 'step-2a', type: 'set_context', key: 'result', value: 'blue branch' },
          ],
        },
        {
          id: 'step-3',
          type: 'branch',
          contextKey: 'color',
          matchValue: 'red',
          thenSteps: [
            { id: 'step-3a', type: 'set_context', key: 'result', value: 'red branch' },
          ],
        },
        { id: 'step-4', type: 'output', template: '{{result}}' },
      ],
    };

    const result = await runner.execute(plan);
    expect(result).toBe('red branch');
  });

  it('skips all branches when none match', async () => {
    const { runner } = createRunner();
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Test',
      steps: [
        { id: 'step-1', type: 'set_context', key: 'x', value: 'none' },
        {
          id: 'step-2',
          type: 'branch',
          contextKey: 'x',
          matchValue: 'a',
          thenSteps: [{ id: 's2a', type: 'set_context', key: 'r', value: 'matched' }],
        },
        { id: 'step-3', type: 'output', template: 'result={{r}}' },
      ],
    };

    const result = await runner.execute(plan);
    // r was never set, so template resolves to empty
    expect(result).toBe('result=');
  });
});

describe('SkillRunner run_agent', () => {
  it('calls agent runner and stores result in context', async () => {
    const { runner, agentRunner } = createRunner([], 'Generated a deck');
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Test',
      steps: [
        { id: 'step-1', type: 'set_context', key: 'topic', value: 'AI' },
        { id: 'step-2', type: 'run_agent', prompt: 'Build a {{topic}} presentation', storeAs: 'deck' },
        { id: 'step-3', type: 'output', template: 'Deck: {{deck}}' },
      ],
    };

    const result = await runner.execute(plan);
    expect(result).toBe('Deck: Generated a deck');

    // Verify agent was called with resolved prompt wrapped in user-data tags
    expect(agentRunner.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: wrapUserData('Build a AI presentation'),
        workingDir: TEST_WORKING_DIR,
      }),
    );
    // Verify system prompt includes security rules
    const callArgs = agentRunner.execute.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('Security Rules');
    expect(callArgs.systemPrompt).toContain(TEST_WORKING_DIR);
  });
});

describe('SkillRunner invoke_skill', () => {
  it('invokes a simple skill as agent and stores result', async () => {
    const skills: SkillSpec[] = [
      { id: 'helper', name: 'Helper', prompt: 'Do helpful things about {{topic}}', category: 'agent' },
    ];
    const { runner, agentRunner } = createRunner(skills, 'Helper result');

    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Main',
      steps: [
        { id: 'step-1', type: 'set_context', key: 'topic', value: 'testing' },
        { id: 'step-2', type: 'invoke_skill', skillId: 'helper', storeAs: 'help_out' },
        { id: 'step-3', type: 'output', template: 'Got: {{help_out}}' },
      ],
    };

    const result = await runner.execute(plan);
    expect(result).toBe('Got: Helper result');
    expect(agentRunner.execute).toHaveBeenCalled();
  });

  it('throws when invoking nonexistent skill', async () => {
    const { runner } = createRunner();
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Main',
      steps: [
        { id: 'step-1', type: 'invoke_skill', skillId: 'nonexistent', storeAs: 'x' },
      ],
    };

    await expect(runner.execute(plan)).rejects.toThrow('Skill not found');
  });
});

describe('SkillRunner cycle detection', () => {
  it('detects direct self-recursion', async () => {
    const skills: SkillSpec[] = [
      {
        id: 'self-ref',
        name: 'SelfRef',
        prompt: '',
        category: 'composite',
        workspace: {
          blocks: {
            blocks: [
              {
                type: 'skill_flow_start',
                next: {
                  block: {
                    type: 'skill_invoke',
                    fields: { SKILL_ID: 'self-ref', STORE_AS: 'x' },
                  },
                },
              },
            ],
          },
        },
      },
    ];
    const { runner, events } = createRunner(skills);

    const plan: SkillPlan = {
      skillId: 'self-ref',
      skillName: 'SelfRef',
      steps: [
        { id: 'step-1', type: 'invoke_skill', skillId: 'self-ref', storeAs: 'x' },
      ],
    };

    await expect(runner.execute(plan)).rejects.toThrow(/[Cc]ycle/);
    const errors = eventsOfType(events, 'skill_error');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('resolveTemplate', () => {
  it('replaces {{key}} with context values', () => {
    const ctx: SkillContext = { entries: { name: 'World', count: '3' } };
    expect(resolveTemplate('Hello {{name}}, count={{count}}', ctx)).toBe('Hello World, count=3');
  });

  it('resolves from parent context when not in current', () => {
    const parent: SkillContext = { entries: { inherited: 'yes' } };
    const ctx: SkillContext = { entries: { local: 'here' }, parentContext: parent };
    expect(resolveTemplate('{{inherited}} and {{local}}', ctx)).toBe('yes and here');
  });

  it('replaces missing keys with empty string', () => {
    const ctx: SkillContext = { entries: {} };
    expect(resolveTemplate('Value: {{missing}}', ctx)).toBe('Value: ');
  });

  it('handles array values by joining', () => {
    const ctx: SkillContext = { entries: { tags: ['a', 'b', 'c'] } };
    expect(resolveTemplate('Tags: {{tags}}', ctx)).toBe('Tags: a, b, c');
  });
});
