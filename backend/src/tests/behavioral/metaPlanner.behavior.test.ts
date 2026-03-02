/** Behavioral tests for MetaPlanner.
 *
 * Tests JSON parse retry flow, validate() edge cases (circular deps,
 * missing agents, bad task refs, path filtering, persona cap).
 * The Anthropic SDK is mocked; MetaPlanner's own logic runs for real.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// -- Module mock (hoisted) --

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

import { MetaPlanner } from '../../services/metaPlanner.js';

// -- Helpers --

function makeTextResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
  };
}

function makeValidPlan(overrides: Partial<Record<string, any>> = {}) {
  return {
    tasks: [
      {
        id: 'task-1',
        name: 'Build',
        description: 'Build something',
        dependencies: [],
        agent_name: 'Builder Bot',
        acceptance_criteria: ['Done'],
      },
    ],
    agents: [
      {
        name: 'Builder Bot',
        role: 'builder',
        persona: 'A friendly bot',
        allowed_paths: ['src/'],
        restricted_paths: ['.elisa/'],
      },
    ],
    plan_explanation: 'Build it.',
    ...overrides,
  };
}

/** Configure the mock to return valid JSON on first call. */
function configureValidResponse(plan?: Record<string, any>) {
  const p = plan ?? makeValidPlan();
  const json = JSON.stringify(p);
  mockCreate.mockResolvedValueOnce(makeTextResponse(json));
}

// -- Setup --

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Successful planning
// ============================================================

describe('successful planning', () => {
  it('parses valid JSON response and returns the plan', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan();
    configureValidResponse(plan);

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });

    expect(result.tasks).toHaveLength(1);
    expect(result.agents).toHaveLength(1);
    expect(result.tasks[0].id).toBe('task-1');
  });

  it('injects default agents when spec has none', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan();
    configureValidResponse(plan);

    await planner.plan({ nugget: { goal: 'test', type: 'software' } });

    // The mock receives the call -- verify the spec was augmented with agents
    const callArgs = mockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[0].content;
    expect(userContent).toContain('"agents"');
  });

  it('does not use assistant prefill (required for Opus model compatibility)', async () => {
    const planner = new MetaPlanner();
    configureValidResponse();

    await planner.plan({ nugget: { goal: 'test', type: 'software' } });

    const callArgs = mockCreate.mock.calls[0][0];
    const messages = callArgs.messages;
    // All messages must be user role -- no assistant prefill
    for (const msg of messages) {
      expect(msg.role).toBe('user');
    }
    // Conversation must end with a user message
    expect(messages[messages.length - 1].role).toBe('user');
  });
});

// ============================================================
// JSON parse retry
// ============================================================

describe('JSON parse retry', () => {
  it('retries when first response is invalid JSON and succeeds on retry', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan();

    // First call returns invalid JSON
    mockCreate.mockResolvedValueOnce(makeTextResponse('not valid json at all'));

    // Retry call returns valid JSON
    mockCreate.mockResolvedValueOnce(makeTextResponse(JSON.stringify(plan)));

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.tasks).toHaveLength(1);
  });

  it('throws when both initial parse and retry fail', async () => {
    const planner = new MetaPlanner();

    // First call: invalid JSON
    mockCreate.mockResolvedValueOnce(makeTextResponse('garbage'));
    // Retry: also invalid JSON
    mockCreate.mockResolvedValueOnce(makeTextResponse('still garbage'));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow('Meta-planner failed to produce valid JSON after retry');
  });

  it('strips markdown code fences from response', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan();
    const json = JSON.stringify(plan);

    // parseJson strips fences first, extracting the JSON inside.
    mockCreate.mockResolvedValueOnce(
      makeTextResponse('```json\n' + json + '\n```'),
    );

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });
    expect(result.tasks).toHaveLength(1);
  });
});

// ============================================================
// validate() edge cases
// ============================================================

describe('validate() edge cases', () => {
  it('throws on missing tasks key', async () => {
    const planner = new MetaPlanner();
    const badPlan = { agents: [{ name: 'Bot', role: 'builder', persona: '' }] };
    const json = JSON.stringify(badPlan);
    mockCreate.mockResolvedValueOnce(makeTextResponse(json));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow("'tasks'");
  });

  it('throws on missing agents key', async () => {
    const planner = new MetaPlanner();
    const badPlan = {
      tasks: [{ id: 't1', name: 'X', description: '', dependencies: [], acceptance_criteria: [] }],
    };
    const json = JSON.stringify(badPlan);
    mockCreate.mockResolvedValueOnce(makeTextResponse(json));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow("'agents'");
  });

  it('throws on empty tasks array', async () => {
    const planner = new MetaPlanner();
    const badPlan = { tasks: [], agents: [{ name: 'Bot', role: 'builder', persona: '' }] };
    const json = JSON.stringify(badPlan);
    mockCreate.mockResolvedValueOnce(makeTextResponse(json));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow('at least one task');
  });

  it('throws when a task depends on nonexistent task', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan({
      tasks: [
        {
          id: 'task-1',
          name: 'Build',
          description: '',
          dependencies: ['task-999'],
          agent_name: 'Builder Bot',
          acceptance_criteria: [],
        },
      ],
    });
    const json = JSON.stringify(plan);
    mockCreate.mockResolvedValueOnce(makeTextResponse(json));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow('unknown task task-999');
  });

  it('throws when a task is assigned to nonexistent agent', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan({
      tasks: [
        {
          id: 'task-1',
          name: 'Build',
          description: '',
          dependencies: [],
          agent_name: 'Ghost Bot',
          acceptance_criteria: [],
        },
      ],
    });
    const json = JSON.stringify(plan);
    mockCreate.mockResolvedValueOnce(makeTextResponse(json));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow('unknown agent Ghost Bot');
  });

  it('throws when task has no id', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan({
      tasks: [
        { name: 'Build', description: '', dependencies: [], agent_name: 'Builder Bot', acceptance_criteria: [] },
      ],
    });
    const json = JSON.stringify(plan);
    mockCreate.mockResolvedValueOnce(makeTextResponse(json));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow("missing 'id'");
  });

  it('throws when task has no dependencies field', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan({
      tasks: [
        { id: 'task-1', name: 'Build', description: '', agent_name: 'Builder Bot', acceptance_criteria: [] },
      ],
    });
    const json = JSON.stringify(plan);
    mockCreate.mockResolvedValueOnce(makeTextResponse(json));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow("missing 'dependencies'");
  });

  it('filters absolute paths from agent allowed_paths', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan({
      agents: [
        {
          name: 'Builder Bot',
          role: 'builder',
          persona: 'friendly',
          allowed_paths: ['src/', '/etc/passwd', '../secret', 'tests/'],
          restricted_paths: ['.elisa/'],
        },
      ],
    });
    configureValidResponse(plan);

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });
    const agent = result.agents[0];
    expect(agent.allowed_paths).toContain('src/');
    expect(agent.allowed_paths).toContain('tests/');
    expect(agent.allowed_paths).not.toContain('/etc/passwd');
    expect(agent.allowed_paths).not.toContain('../secret');
  });

  it('always enforces .elisa/ in restricted_paths', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan({
      agents: [
        {
          name: 'Builder Bot',
          role: 'builder',
          persona: 'friendly',
          allowed_paths: ['src/'],
          restricted_paths: ['node_modules/'],
        },
      ],
    });
    configureValidResponse(plan);

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });
    const agent = result.agents[0];
    expect(agent.restricted_paths).toContain('.elisa/');
    expect(agent.restricted_paths).toContain('node_modules/');
  });

  it('does not duplicate .elisa/ if already present', async () => {
    const planner = new MetaPlanner();
    const plan = makeValidPlan({
      agents: [
        {
          name: 'Builder Bot',
          role: 'builder',
          persona: 'friendly',
          allowed_paths: ['src/'],
          restricted_paths: ['.elisa/', 'vendor/'],
        },
      ],
    });
    configureValidResponse(plan);

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });
    const agent = result.agents[0];
    const elisaEntries = agent.restricted_paths.filter((p: string) => p.includes('.elisa'));
    expect(elisaEntries).toHaveLength(1);
  });

  it('caps persona to 500 chars and strips markdown headings', async () => {
    const planner = new MetaPlanner();
    const longPersona = '# Title\n' + 'A'.repeat(600);
    const plan = makeValidPlan({
      agents: [
        {
          name: 'Builder Bot',
          role: 'builder',
          persona: longPersona,
          allowed_paths: ['src/'],
          restricted_paths: ['.elisa/'],
        },
      ],
    });
    configureValidResponse(plan);

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });
    const persona = result.agents[0].persona;
    expect(persona.length).toBeLessThanOrEqual(500);
    expect(persona).not.toMatch(/^#{1,6}\s/m);
  });

  it('caps task description to 2000 chars', async () => {
    const planner = new MetaPlanner();
    const longDesc = 'X'.repeat(3000);
    const plan = makeValidPlan({
      tasks: [
        {
          id: 'task-1',
          name: 'Build',
          description: longDesc,
          dependencies: [],
          agent_name: 'Builder Bot',
          acceptance_criteria: [],
        },
      ],
    });
    configureValidResponse(plan);

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });
    expect(result.tasks[0].description.length).toBeLessThanOrEqual(2000);
  });
});

// ============================================================
// Graph context injection
// ============================================================

describe('graph context injection', () => {
  it('plan() works without graphContext (backward compatible)', async () => {
    const planner = new MetaPlanner();
    configureValidResponse();

    const result = await planner.plan({ nugget: { goal: 'test', type: 'software' } });

    expect(result.tasks).toHaveLength(1);
    // System prompt should NOT contain graph context markers
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).not.toContain('## Spec Graph Context');
  });

  it('plan() with graphContext appends it to the system prompt', async () => {
    const planner = new MetaPlanner();
    configureValidResponse();

    const graphContext = '## Spec Graph Context\n\n### Existing Nuggets (2)\n- **Weather App** [abc12345]: Build a weather app\n- **Dashboard** [def67890]: Build a dashboard';

    await planner.plan({ nugget: { goal: 'test', type: 'software' } }, graphContext);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('## Spec Graph Context');
    expect(callArgs.system).toContain('Weather App');
    expect(callArgs.system).toContain('Dashboard');
  });

  it('plan() with empty string graphContext does not alter the prompt', async () => {
    const planner = new MetaPlanner();
    configureValidResponse();

    await planner.plan({ nugget: { goal: 'test', type: 'software' } }, '');

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).not.toContain('## Spec Graph Context');
  });

  it('plan() with undefined graphContext does not alter the prompt', async () => {
    const planner = new MetaPlanner();
    configureValidResponse();

    await planner.plan({ nugget: { goal: 'test', type: 'software' } }, undefined);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).not.toContain('## Spec Graph Context');
  });
});

// ============================================================
// API error handling
// ============================================================

describe('API error handling', () => {
  it('throws when API returns no text content', async () => {
    const planner = new MetaPlanner();
    mockCreate.mockResolvedValueOnce({ content: [] });

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow('No text content');
  });

  it('propagates API errors', async () => {
    const planner = new MetaPlanner();
    mockCreate.mockRejectedValueOnce(new Error('Rate limit exceeded'));

    await expect(planner.plan({ nugget: { goal: 'test', type: 'software' } }))
      .rejects.toThrow('Rate limit exceeded');
  });
});
