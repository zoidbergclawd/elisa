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

  it('coerces non-string non-array values to string (A2)', () => {
    const ctx: SkillContext = { entries: { count: 42 as any, flag: true as any, zero: 0 as any } };
    expect(resolveTemplate('count={{count}} flag={{flag}} zero={{zero}}', ctx))
      .toBe('count=42 flag=true zero=0');
  });

  it('coerces non-string values from parent context (A2)', () => {
    const parent: SkillContext = { entries: { num: 99 as any } };
    const ctx: SkillContext = { entries: {}, parentContext: parent };
    expect(resolveTemplate('num={{num}}', ctx)).toBe('num=99');
  });
});

describe('SkillRunner ask_user answer extraction fallback (A3)', () => {
  it('falls back to storeAs key when header key is missing from answers', async () => {
    const { runner, events } = createRunner();
    const plan: SkillPlan = {
      skillId: 's1',
      skillName: 'Test',
      steps: [
        { id: 'step-1', type: 'ask_user', question: 'Pick one', header: 'Choice', options: ['A', 'B'], storeAs: 'user_choice' },
        { id: 'step-2', type: 'output', template: 'Picked: {{user_choice}}' },
      ],
    };

    const resultPromise = runner.execute(plan);

    await vi.waitFor(() => {
      expect(events.some(e => e.type === 'skill_question')).toBe(true);
    }, { timeout: 2000 });

    // Answer keyed by storeAs instead of header -- triggers the new fallback
    runner.respondToQuestion('step-1', { user_choice: 'B' });

    const result = await resultPromise;
    expect(result).toBe('Picked: B');
  });
});

describe('SkillRunner interpretWorkspaceOnBackend invalid blocks (A4)', () => {
  it('skips ask_user blocks with empty QUESTION field', () => {
    const { runner } = createRunner();
    const skill: SkillSpec = {
      id: 'test',
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
                  id: 'ask-empty',
                  type: 'skill_ask_user',
                  fields: { QUESTION: '', HEADER: 'H', OPTIONS: 'A,B', STORE_AS: 'x' },
                  next: {
                    block: {
                      id: 'out1',
                      type: 'skill_output',
                      fields: { TEMPLATE: 'done' },
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
    // The ask_user block with empty question should be filtered out
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].type).toBe('output');
  });

  it('skips ask_user blocks with whitespace-only QUESTION field', () => {
    const { runner } = createRunner();
    const skill: SkillSpec = {
      id: 'test',
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
                  id: 'ask-ws',
                  type: 'skill_ask_user',
                  fields: { QUESTION: '   ', HEADER: 'H', OPTIONS: 'A,B', STORE_AS: 'x' },
                },
              },
            },
          ],
        },
      },
    };

    const plan = runner.interpretWorkspaceOnBackend(skill);
    expect(plan.steps).toHaveLength(0);
  });

  it('skips run_agent blocks with empty PROMPT field', () => {
    const { runner } = createRunner();
    const skill: SkillSpec = {
      id: 'test',
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
                  id: 'agent-empty',
                  type: 'skill_run_agent',
                  fields: { PROMPT: '', STORE_AS: 'x' },
                  next: {
                    block: {
                      id: 'out1',
                      type: 'skill_output',
                      fields: { TEMPLATE: 'done' },
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
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].type).toBe('output');
  });
});

describe('SkillRunner respondToQuestion unknown stepId (A5)', () => {
  it('logs a warning but does not throw for unknown stepId', () => {
    const { runner } = createRunner();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    expect(() => runner.respondToQuestion('nonexistent-step', { answer: 'yes' })).not.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('nonexistent-step'),
    );

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// B2: Nested composite skills -- parent -> child -> grandchild context threading
// ---------------------------------------------------------------------------

describe('Nested composite skills', () => {
  it('executes parent -> child -> grandchild with context threading', async () => {
    const skills: SkillSpec[] = [
      {
        id: 'grandchild',
        name: 'Grandchild',
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
                    fields: { KEY: 'grandchild_data', VALUE: 'gc-value' },
                    next: {
                      block: {
                        type: 'skill_output',
                        fields: { TEMPLATE: 'grandchild says {{parent_data}}' },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
      {
        id: 'child',
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
                    fields: { KEY: 'child_data', VALUE: 'child-value' },
                    next: {
                      block: {
                        type: 'skill_invoke',
                        fields: { SKILL_ID: 'grandchild', STORE_AS: 'gc_result' },
                        next: {
                          block: {
                            type: 'skill_output',
                            fields: { TEMPLATE: '{{gc_result}}' },
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
      },
    ];
    const { runner } = createRunner(skills);

    const plan: SkillPlan = {
      skillId: 'parent',
      skillName: 'Parent',
      steps: [
        { id: 'p1', type: 'set_context', key: 'parent_data', value: 'from-parent' },
        { id: 'p2', type: 'invoke_skill', skillId: 'child', storeAs: 'child_out' },
        { id: 'p3', type: 'output', template: 'Final: {{child_out}}' },
      ],
    };

    const result = await runner.execute(plan);
    // Grandchild resolves {{parent_data}} from the parent context chain
    expect(result).toBe('Final: grandchild says from-parent');
  });

  it('child ask_user can read parent context', async () => {
    const skills: SkillSpec[] = [
      {
        id: 'asking-child',
        name: 'AskingChild',
        prompt: '',
        category: 'composite',
        workspace: {
          blocks: {
            blocks: [
              {
                type: 'skill_flow_start',
                next: {
                  block: {
                    id: 'ask-step',
                    type: 'skill_ask_user',
                    fields: {
                      QUESTION: 'Parent set: {{parent_val}}. Pick one?',
                      HEADER: 'Choice',
                      OPTIONS: 'X,Y',
                      STORE_AS: 'user_pick',
                    },
                    next: {
                      block: {
                        type: 'skill_output',
                        fields: { TEMPLATE: 'picked={{user_pick}}' },
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
    const { runner, events } = createRunner(skills);

    const plan: SkillPlan = {
      skillId: 'parent-ask',
      skillName: 'ParentAsk',
      steps: [
        { id: 'p1', type: 'set_context', key: 'parent_val', value: 'hello' },
        { id: 'p2', type: 'invoke_skill', skillId: 'asking-child', storeAs: 'child_out' },
        { id: 'p3', type: 'output', template: '{{child_out}}' },
      ],
    };

    const resultPromise = runner.execute(plan);

    // Wait for the question event from the child
    await vi.waitFor(() => {
      expect(events.some(e => e.type === 'skill_question')).toBe(true);
    }, { timeout: 2000 });

    const questionEvt = events.find(e => e.type === 'skill_question')!;
    // The question should have resolved {{parent_val}} from parent context
    expect(questionEvt.questions[0].question).toBe('Parent set: hello. Pick one?');

    // Answer it
    runner.respondToQuestion('ask-step', { Choice: 'Y' });

    const result = await resultPromise;
    expect(result).toBe('picked=Y');
  });

  it('parent context is not polluted by child writes', async () => {
    const skills: SkillSpec[] = [
      {
        id: 'writing-child',
        name: 'WritingChild',
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
                    fields: { KEY: 'child_only', VALUE: 'should-not-leak' },
                    next: {
                      block: {
                        type: 'skill_set_context',
                        fields: { KEY: 'shared_key', VALUE: 'child-override' },
                        next: {
                          block: {
                            type: 'skill_output',
                            fields: { TEMPLATE: 'done' },
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
      },
    ];
    const { runner } = createRunner(skills);

    const plan: SkillPlan = {
      skillId: 'parent-isolation',
      skillName: 'ParentIsolation',
      steps: [
        { id: 'p1', type: 'set_context', key: 'shared_key', value: 'parent-original' },
        { id: 'p2', type: 'invoke_skill', skillId: 'writing-child', storeAs: 'child_out' },
        // After child runs, parent's shared_key should still be its original value
        { id: 'p3', type: 'output', template: 'shared={{shared_key}} child_only={{child_only}}' },
      ],
    };

    const result = await runner.execute(plan);
    // Parent's shared_key should be unchanged; child_only should not exist in parent
    expect(result).toBe('shared=parent-original child_only=');
  });
});

// ---------------------------------------------------------------------------
// B3: run_agent streaming -- verify skill_output events during agent execution
// ---------------------------------------------------------------------------

describe('run_agent streaming', () => {
  it('emits skill_output events during agent execution via onOutput', async () => {
    // Create a custom agent runner that invokes onOutput callbacks
    const streamingAgentRunner = {
      execute: vi.fn(async (opts: { onOutput?: (taskId: string, content: string) => Promise<void>; [key: string]: any }) => {
        // Simulate streaming: call onOutput several times before resolving
        if (opts.onOutput) {
          await opts.onOutput('skill-step-1', 'Thinking...');
          await opts.onOutput('skill-step-1', 'Writing code...');
          await opts.onOutput('skill-step-1', 'Done!');
        }
        return {
          success: true,
          summary: 'Agent finished',
          costUsd: 0.01,
          inputTokens: 100,
          outputTokens: 50,
        };
      }),
    } as any;

    const events: Record<string, any>[] = [];
    const send = vi.fn(async (evt: Record<string, any>) => {
      events.push(evt);
    });
    const runner = new SkillRunner(send, [], streamingAgentRunner, TEST_WORKING_DIR);

    const plan: SkillPlan = {
      skillId: 'stream-test',
      skillName: 'StreamTest',
      steps: [
        { id: 'step-1', type: 'run_agent', prompt: 'Build something', storeAs: 'result' },
        { id: 'step-2', type: 'output', template: '{{result}}' },
      ],
    };

    const result = await runner.execute(plan);
    expect(result).toBe('Agent finished');

    // Collect all skill_output events
    const outputEvents = events.filter(e => e.type === 'skill_output');

    // There should be outputs from the streaming (onOutput calls) plus the
    // "Running agent:" output plus the final output step
    // The run_agent step emits: 1 "Running agent:..." + 3 streaming + 1 from output step = 5
    expect(outputEvents.length).toBeGreaterThanOrEqual(4);

    // Check that streaming outputs are present
    const outputContents = outputEvents.map(e => e.content);
    expect(outputContents).toContain('Thinking...');
    expect(outputContents).toContain('Writing code...');
    expect(outputContents).toContain('Done!');
  });

  it('stores agent summary in context even when onOutput streams', async () => {
    const streamingAgentRunner = {
      execute: vi.fn(async (opts: { onOutput?: (taskId: string, content: string) => Promise<void>; [key: string]: any }) => {
        if (opts.onOutput) {
          await opts.onOutput('skill-step-1', 'partial output');
        }
        return {
          success: true,
          summary: 'Final summary',
          costUsd: 0,
          inputTokens: 10,
          outputTokens: 5,
        };
      }),
    } as any;

    const events: Record<string, any>[] = [];
    const send = vi.fn(async (evt: Record<string, any>) => {
      events.push(evt);
    });
    const runner = new SkillRunner(send, [], streamingAgentRunner, TEST_WORKING_DIR);

    const plan: SkillPlan = {
      skillId: 'store-test',
      skillName: 'StoreTest',
      steps: [
        { id: 'step-1', type: 'run_agent', prompt: 'Do work', storeAs: 'work_result' },
        { id: 'step-2', type: 'output', template: 'Got: {{work_result}}' },
      ],
    };

    const result = await runner.execute(plan);
    // The agent's summary should be stored and used in the template
    expect(result).toBe('Got: Final summary');
  });

  it('emits skill_output with step_id matching the run_agent step', async () => {
    const streamingAgentRunner = {
      execute: vi.fn(async (opts: { onOutput?: (taskId: string, content: string) => Promise<void>; [key: string]: any }) => {
        if (opts.onOutput) {
          await opts.onOutput('skill-agent-step', 'streamed line');
        }
        return {
          success: true,
          summary: 'ok',
          costUsd: 0,
          inputTokens: 10,
          outputTokens: 5,
        };
      }),
    } as any;

    const events: Record<string, any>[] = [];
    const send = vi.fn(async (evt: Record<string, any>) => {
      events.push(evt);
    });
    const runner = new SkillRunner(send, [], streamingAgentRunner, TEST_WORKING_DIR);

    const plan: SkillPlan = {
      skillId: 'stepid-test',
      skillName: 'StepIdTest',
      steps: [
        { id: 'agent-step', type: 'run_agent', prompt: 'Do it', storeAs: 'out' },
      ],
    };

    await runner.execute(plan);

    // All skill_output events for the run_agent step should have the correct step_id
    const agentOutputs = events.filter(
      e => e.type === 'skill_output' && e.step_id === 'agent-step',
    );
    expect(agentOutputs.length).toBeGreaterThanOrEqual(1);
    // The streaming output should be among them
    expect(agentOutputs.some(e => e.content === 'streamed line')).toBe(true);
  });
});
