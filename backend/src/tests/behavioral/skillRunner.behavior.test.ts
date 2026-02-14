/** Behavioral tests for the SkillRunner.
 *
 * These tests verify step execution order, context threading,
 * question/answer flow, branching, skill invocation, and cycle detection.
 * AgentRunner is mocked; SkillRunner's control flow runs for real.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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

  it('detects indirect cycle (A -> B -> A)', async () => {
    const skills: SkillSpec[] = [
      {
        id: 'skill-a',
        name: 'Skill A',
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
                    fields: { SKILL_ID: 'skill-b', STORE_AS: 'result' },
                  },
                },
              },
            ],
          },
        },
      },
      {
        id: 'skill-b',
        name: 'Skill B',
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
                    fields: { SKILL_ID: 'skill-a', STORE_AS: 'result' },
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
      skillId: 'skill-a',
      skillName: 'Skill A',
      steps: [
        { id: 'step-1', type: 'invoke_skill', skillId: 'skill-b', storeAs: 'result' },
      ],
    };

    await expect(runner.execute(plan)).rejects.toThrow(/[Cc]ycle/);
    const errors = eventsOfType(events, 'skill_error');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('SkillRunner max depth enforcement', () => {
  it('throws when exceeding MAX_DEPTH (10) nested calls', async () => {
    // Create 11 composite skills each invoking the next
    const skills: SkillSpec[] = [];
    for (let i = 0; i <= 11; i++) {
      skills.push({
        id: `skill-${i}`,
        name: `Skill ${i}`,
        prompt: '',
        category: 'composite',
        workspace: {
          blocks: {
            blocks: [
              {
                type: 'skill_flow_start',
                next: i < 11
                  ? {
                      block: {
                        type: 'skill_invoke',
                        fields: { SKILL_ID: `skill-${i + 1}`, STORE_AS: 'x' },
                      },
                    }
                  : undefined,
              },
            ],
          },
        },
      });
    }

    const { runner, events } = createRunner(skills);

    const plan: SkillPlan = {
      skillId: 'skill-0',
      skillName: 'Skill 0',
      steps: [
        { id: 'step-1', type: 'invoke_skill', skillId: 'skill-1', storeAs: 'x' },
      ],
    };

    await expect(runner.execute(plan)).rejects.toThrow(/[Mm]ax.*depth/);
    const errors = eventsOfType(events, 'skill_error');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('SkillRunner composite skill invocation', () => {
  it('recursively executes composite skills and threads context', async () => {
    const skills: SkillSpec[] = [
      {
        id: 'child-skill',
        name: 'Child',
        prompt: '',
        category: 'composite',
        workspace: {
          blocks: {
            blocks: [
              {
                type: 'skill_flow_start',
                next: {
                  block: {
                    type: 'skill_set_context',
                    fields: { KEY: 'child_data', VALUE: 'from-child' },
                    next: {
                      block: {
                        type: 'skill_output',
                        fields: { TEMPLATE: 'child-output' },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ];
    const { runner } = createRunner(skills);

    const plan: SkillPlan = {
      skillId: 'parent-skill',
      skillName: 'Parent',
      steps: [
        { id: 'step-1', type: 'invoke_skill', skillId: 'child-skill', storeAs: 'child_result' },
        { id: 'step-2', type: 'output', template: 'Got: {{child_result}}' },
      ],
    };

    const result = await runner.execute(plan);
    expect(result).toBe('Got: child-output');
  });

  it('runs simple (non-composite) skills via agent runner', async () => {
    const skills: SkillSpec[] = [
      {
        id: 'agent-skill',
        name: 'AgentSkill',
        prompt: 'Do the thing with {{topic}}',
        category: 'agent',
      },
    ];
    const { runner, agentRunner } = createRunner(skills, 'Agent did the thing');

    const plan: SkillPlan = {
      skillId: 'parent',
      skillName: 'Parent',
      steps: [
        { id: 'step-1', type: 'set_context', key: 'topic', value: 'testing' },
        { id: 'step-2', type: 'invoke_skill', skillId: 'agent-skill', storeAs: 'output' },
        { id: 'step-3', type: 'output', template: '{{output}}' },
      ],
    };

    const result = await runner.execute(plan);
    expect(result).toBe('Agent did the thing');
    expect(agentRunner.execute).toHaveBeenCalled();

    // Verify the prompt was resolved with context
    const callArgs = agentRunner.execute.mock.calls[0][0];
    expect(callArgs.prompt).toContain('Do the thing with testing');
  });
});

describe('SkillRunner interpretWorkspaceOnBackend', () => {
  it('interprets a workspace with multiple block types', () => {
    const skills: SkillSpec[] = [];
    const { runner } = createRunner(skills);

    const skill: SkillSpec = {
      id: 'test-skill',
      name: 'Test',
      prompt: '',
      category: 'composite',
      workspace: {
        blocks: {
          blocks: [
            {
              type: 'skill_flow_start',
              next: {
                block: {
                  id: 'b1',
                  type: 'skill_set_context',
                  fields: { KEY: 'mode', VALUE: 'fast' },
                  next: {
                    block: {
                      id: 'b2',
                      type: 'skill_branch_if',
                      fields: { CONTEXT_KEY: 'mode', MATCH_VALUE: 'fast' },
                      inputs: {
                        THEN_BLOCKS: {
                          block: {
                            id: 'b2a',
                            type: 'skill_run_agent',
                            fields: { PROMPT: 'Do it fast', STORE_AS: 'result' },
                          },
                        },
                      },
                      next: {
                        block: {
                          id: 'b3',
                          type: 'skill_output',
                          fields: { TEMPLATE: 'Done: {{result}}' },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    };

    const plan = runner.interpretWorkspaceOnBackend(skill);

    expect(plan.skillId).toBe('test-skill');
    expect(plan.skillName).toBe('Test');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0].type).toBe('set_context');
    expect(plan.steps[1].type).toBe('branch');
    expect(plan.steps[2].type).toBe('output');

    // Check branch has thenSteps
    const branch = plan.steps[1] as any;
    expect(branch.contextKey).toBe('mode');
    expect(branch.matchValue).toBe('fast');
    expect(branch.thenSteps).toHaveLength(1);
    expect(branch.thenSteps[0].type).toBe('run_agent');
  });

  it('returns empty steps when no start block found', () => {
    const { runner } = createRunner();
    const skill: SkillSpec = {
      id: 'empty',
      name: 'Empty',
      prompt: '',
      category: 'composite',
      workspace: { blocks: { blocks: [] } },
    };

    const plan = runner.interpretWorkspaceOnBackend(skill);
    expect(plan.steps).toHaveLength(0);
  });

  it('handles ask_user blocks', () => {
    const { runner } = createRunner();
    const skill: SkillSpec = {
      id: 'ask-skill',
      name: 'Ask',
      prompt: '',
      category: 'composite',
      workspace: {
        blocks: {
          blocks: [
            {
              type: 'skill_flow_start',
              next: {
                block: {
                  id: 'ask1',
                  type: 'skill_ask_user',
                  fields: {
                    QUESTION: 'What color?',
                    HEADER: 'Color',
                    OPTIONS: 'red,blue,green',
                    STORE_AS: 'color',
                  },
                },
              },
            },
          ],
        },
      },
    };

    const plan = runner.interpretWorkspaceOnBackend(skill);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].type).toBe('ask_user');
    const askStep = plan.steps[0] as any;
    expect(askStep.question).toBe('What color?');
    expect(askStep.options).toEqual(['red', 'blue', 'green']);
    expect(askStep.storeAs).toBe('color');
  });

  it('handles invoke blocks', () => {
    const { runner } = createRunner();
    const skill: SkillSpec = {
      id: 'parent',
      name: 'Parent',
      prompt: '',
      category: 'composite',
      workspace: {
        blocks: {
          blocks: [
            {
              type: 'skill_flow_start',
              next: {
                block: {
                  id: 'inv1',
                  type: 'skill_invoke',
                  fields: { SKILL_ID: 'child-id', STORE_AS: 'child_out' },
                },
              },
            },
          ],
        },
      },
    };

    const plan = runner.interpretWorkspaceOnBackend(skill);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].type).toBe('invoke_skill');
    const invokeStep = plan.steps[0] as any;
    expect(invokeStep.skillId).toBe('child-id');
    expect(invokeStep.storeAs).toBe('child_out');
  });
});

describe('SkillRunner ask_user timeout', () => {
  it('rejects after 5 minutes if no answer is provided', async () => {
    vi.useFakeTimers();
    try {
      const { runner, events } = createRunner();
      const plan: SkillPlan = {
        skillId: 's1',
        skillName: 'Test',
        steps: [
          { id: 'step-1', type: 'ask_user', question: 'Pick one', header: 'Choice', options: ['A', 'B'], storeAs: 'choice' },
        ],
      };

      // Attach rejection handler immediately to prevent unhandled rejection
      const resultPromise = runner.execute(plan).catch((e: Error) => e);

      // Wait for the question event
      await vi.waitFor(() => {
        expect(events.some(e => e.type === 'skill_question')).toBe(true);
      }, { timeout: 2000 });

      // Advance past the 5-minute timeout
      await vi.advanceTimersByTimeAsync(300_001);

      const result = await resultPromise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(/timed out after 5 minutes/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears timeout when answer arrives before deadline', async () => {
    const { runner, events } = createRunner();
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Test',
      steps: [
        { id: 'step-1', type: 'ask_user', question: 'Pick one', header: 'Choice', options: ['A', 'B'], storeAs: 'choice' },
        { id: 'step-2', type: 'output', template: 'Chose {{choice}}' },
      ],
    };

    const resultPromise = runner.execute(plan);

    await vi.waitFor(() => {
      expect(events.some(e => e.type === 'skill_question')).toBe(true);
    }, { timeout: 2000 });

    // Answer before timeout
    runner.respondToQuestion('step-1', { Choice: 'A' });

    const result = await resultPromise;
    expect(result).toBe('Chose A');
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
