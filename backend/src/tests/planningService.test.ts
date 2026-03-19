import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlanningService } from '../services/planningService.js';
import type { PlanState } from '../utils/planSchema.js';
import type { PlanningMessage, CanvasContext } from '../models/planning.js';

// --- Mock the Anthropic client ---

const mockCreate = vi.fn();

vi.mock('../utils/anthropicClient.js', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate },
  }),
}));

// --- Helpers ---

function validTurnOutput(overrides: Record<string, unknown> = {}) {
  return {
    message: 'Great idea! What kind of project is this?',
    question: {
      text: 'What should this project do?',
      type: 'single_select',
      options: [
        { label: 'A web app', value: 'web' },
        { label: 'A CLI tool', value: 'cli' },
        { label: 'Not sure', value: 'unsure' },
      ],
    },
    plan_mutation_map: {
      web: { 'deploy.target': 'web' },
      cli: { 'deploy.target': 'cli' },
      unsure: null,
    },
    plan: {
      idea: 'A quiz app',
      goal: { description: 'A quiz app for science', confidence: 'rough' },
      promises: [],
      skills: [],
      portals: [],
      deploy: { target: null, constraints: [] },
      open_questions: ['What kind of quizzes?'],
      ready: false,
      conversation_turn: 0,
    },
    teaching: null,
    ...overrides,
  };
}

function readyPlan(): PlanState {
  return {
    idea: 'A quiz app',
    goal: { description: 'A quiz app for science', confidence: 'solid' },
    promises: [
      { description: 'Shows correct answers', category: 'behavior', proofs: [{ description: 'Answers are shown' }] },
      { description: 'Tracks score', category: 'behavior', proofs: [{ description: 'Score increments' }] },
    ],
    skills: [{ name: 'Generate questions', description: 'Creates quiz from material' }],
    portals: [{ name: 'Claude API', subtype: 'api', description: 'Reasoning' }],
    deploy: { target: 'web', constraints: [] },
    open_questions: [],
    ready: true,
    conversation_turn: 5,
  };
}

function mockClaudeResponse(output: Record<string, unknown>) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(output) }],
  });
}

// --- Tests ---

describe('PlanningService', () => {
  let service: PlanningService;

  beforeEach(() => {
    service = new PlanningService('test-model');
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- startPlanning ---

  describe('startPlanning', () => {
    it('creates a session and returns first question from Claude', async () => {
      const output = validTurnOutput();
      mockClaudeResponse(output);

      const result = await service.startPlanning('session-1', 'A quiz app');

      expect(result.message).toBe(output.message);
      expect(result.question).toEqual(output.question);
      expect(result.status).toBe('active');
      expect(mockCreate).toHaveBeenCalledTimes(1);

      const state = service.getState('session-1');
      expect(state).toBeDefined();
      expect(state!.plan.idea).toBe('A quiz app');
      expect(state!.conversationHistory).toHaveLength(2); // kid message + agent response
    });

    it('throws if session already exists', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'A quiz app');

      await expect(service.startPlanning('session-1', 'Another idea')).rejects.toThrow(
        'Planning session already exists',
      );
    });

    it('passes canvas context to the prompt', async () => {
      const canvasContext: CanvasContext = {
        blocks: [
          { type: 'Goal', content: 'Existing goal' },
          { type: 'Portal', content: 'Weather API', subtype: 'api' },
        ],
        hasGoal: true,
        promiseCount: 0,
        skillCount: 0,
        portalCount: 1,
        hasDeployTarget: false,
      };

      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'Weather app', canvasContext);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('Mid-Project Context');
      expect(callArgs.system).toContain('Weather API');
    });
  });

  // --- handleStructuredAnswer ---

  describe('handleStructuredAnswer', () => {
    it('applies mutation from plan_mutation_map without API call', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'A quiz app');
      mockCreate.mockClear();

      const result = service.handleStructuredAnswer('session-1', 'web');

      expect(result.plan.deploy.target).toBe('web');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('handles null mutation (no-op option)', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'A quiz app');

      const stateBefore = { ...service.getState('session-1')!.plan };
      const result = service.handleStructuredAnswer('session-1', 'unsure');

      // deploy.target should still be null (no mutation applied)
      expect(result.plan.deploy.target).toBe(stateBefore.deploy.target);
    });

    it('throws if no active mutation map', async () => {
      const output = validTurnOutput();
      mockClaudeResponse(output);
      await service.startPlanning('session-1', 'A quiz app');

      // Answer once to clear the mutation map
      service.handleStructuredAnswer('session-1', 'web');

      // Second answer should fail (no mutation map)
      expect(() => service.handleStructuredAnswer('session-1', 'cli')).toThrow(
        'No active question with mutation map',
      );
    });

    it('throws for unknown session', () => {
      expect(() => service.handleStructuredAnswer('nonexistent', 'web')).toThrow(
        'No planning session found',
      );
    });

    it('detects readiness after mutation fills all gaps', async () => {
      // Set up a session with a near-ready plan
      const nearReadyOutput = validTurnOutput({
        plan: {
          idea: 'A quiz app',
          goal: { description: 'Quiz app', confidence: 'solid' },
          promises: [
            { description: 'Shows answers', category: 'behavior', proofs: [{ description: 'Check answers' }] },
            { description: 'Tracks score', category: 'behavior', proofs: [{ description: 'Score updates' }] },
          ],
          skills: [{ name: 'Generate', description: 'Makes questions' }],
          portals: [{ name: 'API', subtype: 'api', description: 'AI' }],
          deploy: { target: null, constraints: [] },
          open_questions: [],
          ready: false,
          conversation_turn: 4,
        },
        plan_mutation_map: {
          web: { 'deploy.target': 'web' },
          cli: { 'deploy.target': 'cli' },
        },
      });
      mockClaudeResponse(nearReadyOutput);
      await service.startPlanning('session-1', 'A quiz app');

      const result = service.handleStructuredAnswer('session-1', 'web');

      expect(result.plan.ready).toBe(true);
      expect(result.status).toBe('ready');
    });
  });

  // --- handleFreeTextAnswer ---

  describe('handleFreeTextAnswer', () => {
    it('sends text to Claude and returns updated plan', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'A quiz app');

      const secondOutput = validTurnOutput({
        message: 'Got it! Science quizzes are cool!',
        plan: {
          ...validTurnOutput().plan,
          goal: { description: 'A science quiz app', confidence: 'solid' },
          conversation_turn: 1,
        },
      });
      mockClaudeResponse(secondOutput);

      const result = await service.handleFreeTextAnswer('session-1', 'Science quizzes!');

      expect(result.message).toBe('Got it! Science quizzes are cool!');
      expect(result.plan.goal.confidence).toBe('solid');
      expect(mockCreate).toHaveBeenCalledTimes(2); // start + free text
    });

    it('throws for unknown session', async () => {
      await expect(service.handleFreeTextAnswer('nonexistent', 'hello')).rejects.toThrow(
        'No planning session found',
      );
    });
  });

  // --- Turn cap ---

  describe('turn cap', () => {
    it('forces readiness at PLANNING_MAX_TURNS', async () => {
      const output = validTurnOutput({
        plan: {
          ...validTurnOutput().plan,
          conversation_turn: 19, // Will become 20 (the max)
        },
      });
      mockClaudeResponse(output);
      await service.startPlanning('session-1', 'A quiz app');

      // Manually set conversation_turn to 20
      const state = service.getState('session-1')!;
      state.plan.conversation_turn = 20;

      const result = await service.handleFreeTextAnswer('session-1', 'More details');

      expect(result.status).toBe('ready');
      expect(result.plan.ready).toBe(true);
      expect(result.question).toBeNull();
      // Should not have called Claude again (turn cap hit)
      expect(mockCreate).toHaveBeenCalledTimes(1); // only the startPlanning call
    });

    it('sets deploy target to web when forced ready without one', async () => {
      const output = validTurnOutput({
        plan: {
          ...validTurnOutput().plan,
          deploy: { target: null, constraints: [] },
          conversation_turn: 19,
        },
      });
      mockClaudeResponse(output);
      await service.startPlanning('session-1', 'A quiz app');

      const state = service.getState('session-1')!;
      state.plan.conversation_turn = 20;

      const result = await service.handleFreeTextAnswer('session-1', 'More details');

      expect(result.status).toBe('ready');
      expect(result.plan.deploy.target).toBe('web');
    });

    it('preserves existing deploy target when forced ready', async () => {
      const output = validTurnOutput({
        plan: {
          ...validTurnOutput().plan,
          deploy: { target: 'cli', constraints: [] },
          conversation_turn: 19,
        },
      });
      mockClaudeResponse(output);
      await service.startPlanning('session-1', 'A quiz app');

      const state = service.getState('session-1')!;
      state.plan.conversation_turn = 20;

      const result = await service.handleFreeTextAnswer('session-1', 'More details');

      expect(result.status).toBe('ready');
      expect(result.plan.deploy.target).toBe('cli');
    });
  });

  // --- Validation retry ---

  describe('validation failure retry', () => {
    it('retries once when Claude returns invalid JSON', async () => {
      // First call: start planning with valid response
      mockClaudeResponse(validTurnOutput());

      await service.startPlanning('session-1', 'A quiz app');

      // Second call: invalid response on first attempt
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'This is not JSON at all' }],
      });

      // Third call: retry succeeds
      const retryOutput = validTurnOutput({ message: 'After retry!' });
      mockClaudeResponse(retryOutput);

      const result = await service.handleFreeTextAnswer('session-1', 'Tell me more');

      expect(result.message).toBe('After retry!');
      // 1 (start) + 1 (bad attempt) + 1 (retry) = 3 calls
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('throws after retry also fails', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'A quiz app');

      // Both attempts return garbage
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'not json' }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'still not json' }],
      });

      await expect(service.handleFreeTextAnswer('session-1', 'hello')).rejects.toThrow(
        'Planning agent failed to produce valid JSON after retry',
      );
    });
  });

  // --- generateCanvas ---

  describe('generateCanvas', () => {
    it('deterministically generates canvas blocks from a ready plan', async () => {
      const readyOutput = validTurnOutput({
        plan: readyPlan(),
        question: null,
      });
      mockClaudeResponse(readyOutput);
      await service.startPlanning('session-1', 'A quiz app');

      // No mockClaudeResponse needed -- canvas generation is deterministic
      const result = await service.generateCanvas('session-1');

      // Goal + 2 Promises + 1 Skill + 1 Deploy = 5 blocks (portals are plan metadata)
      expect(result.blocks).toHaveLength(5);
      expect(result.blocks[0].type).toBe('Goal');
      expect(result.blocks[0].content).toBe('A quiz app for science');

      // Promises have child proofs
      const promises = result.blocks.filter(b => b.type === 'Promise');
      expect(promises).toHaveLength(2);
      expect(promises[0].children).toHaveLength(1);
      expect(promises[0].children![0].content).toBe('Answers are shown');
      expect(promises[1].children).toHaveLength(1);
      expect(promises[1].children![0].content).toBe('Score increments');

      // Skills are emitted (frontend registers them as IDE skills before loading)
      expect(result.blocks.find(b => b.type === 'Skill')?.content).toBe('Generate questions');
      // Portals are NOT emitted (they need IDE-level registration)
      expect(result.blocks.find(b => b.type === 'Portal')).toBeUndefined();
      expect(result.blocks.find(b => b.type === 'Deploy')).toBeDefined();

      const state = service.getState('session-1')!;
      expect(state.status).toBe('generated');
      expect(state.generatedBlocks).toEqual(result);
    });

    it('throws if plan is not ready', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'A quiz app');

      await expect(service.generateCanvas('session-1')).rejects.toThrow('Plan is not ready');
    });
  });

  // --- checkReadiness ---

  describe('checkReadiness', () => {
    it('returns true for a fully ready plan', () => {
      expect(service.checkReadiness(readyPlan())).toBe(true);
    });

    it('returns false when goal confidence is not solid', () => {
      const plan = readyPlan();
      plan.goal.confidence = 'rough';
      expect(service.checkReadiness(plan)).toBe(false);
    });

    it('returns false with fewer than 2 promises', () => {
      const plan = readyPlan();
      plan.promises = [plan.promises[0]];
      expect(service.checkReadiness(plan)).toBe(false);
    });

    it('returns false when a promise has no proofs', () => {
      const plan = readyPlan();
      plan.promises[0].proofs = [];
      expect(service.checkReadiness(plan)).toBe(false);
    });

    it('returns true with no portals (portals are optional)', () => {
      const plan = readyPlan();
      plan.portals = [];
      expect(service.checkReadiness(plan)).toBe(true);
    });

    it('returns false with no skills', () => {
      const plan = readyPlan();
      plan.skills = [];
      expect(service.checkReadiness(plan)).toBe(false);
    });

    it('returns false with no deploy target', () => {
      const plan = readyPlan();
      plan.deploy.target = null;
      expect(service.checkReadiness(plan)).toBe(false);
    });

    it('returns false with open questions', () => {
      const plan = readyPlan();
      plan.open_questions = ['Remaining question'];
      expect(service.checkReadiness(plan)).toBe(false);
    });
  });

  // --- applyMutations ---

  describe('applyMutations', () => {
    it('sets a nested value via dot notation', () => {
      const plan = readyPlan();
      service.applyMutations(plan as unknown as Record<string, unknown>, {
        'deploy.target': 'cli',
      });
      expect(plan.deploy.target).toBe('cli');
    });

    it('pushes to an array via .push suffix', () => {
      const plan = readyPlan();
      const originalLength = plan.promises.length;
      service.applyMutations(plan as unknown as Record<string, unknown>, {
        'promises.push': { description: 'New promise', category: 'security', proofs: [] },
      });
      expect(plan.promises).toHaveLength(originalLength + 1);
      expect(plan.promises[plan.promises.length - 1].description).toBe('New promise');
    });

    it('sets top-level value', () => {
      const plan = readyPlan();
      service.applyMutations(plan as unknown as Record<string, unknown>, {
        ready: true,
      });
      expect(plan.ready).toBe(true);
    });

    it('sets deeply nested value', () => {
      const plan = readyPlan();
      service.applyMutations(plan as unknown as Record<string, unknown>, {
        'goal.confidence': 'solid',
      });
      expect(plan.goal.confidence).toBe('solid');
    });
  });

  // --- resumePlanning ---

  describe('resumePlanning', () => {
    it('restores a session from saved state', () => {
      const savedPlan = readyPlan();
      savedPlan.ready = false;
      const savedConversation: PlanningMessage[] = [
        { role: 'kid', content: 'I want a quiz app', timestamp: 1000 },
        { role: 'agent', content: 'Cool! What kind?', timestamp: 2000 },
      ];

      const session = service.resumePlanning('session-1', savedPlan, savedConversation);

      expect(session.sessionId).toBe('session-1');
      expect(session.status).toBe('active');
      expect(session.conversationHistory).toHaveLength(2);
      expect(service.getState('session-1')).toBeDefined();
    });

    it('resumes with ready status if plan was ready', () => {
      const savedPlan = readyPlan();
      const session = service.resumePlanning('session-1', savedPlan, []);

      expect(session.status).toBe('ready');
    });
  });

  // --- deleteSession ---

  describe('deleteSession', () => {
    it('removes a session', async () => {
      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-1', 'A quiz app');

      expect(service.getState('session-1')).toBeDefined();
      service.deleteSession('session-1');
      expect(service.getState('session-1')).toBeUndefined();
    });
  });

  // --- Mid-project context ---

  describe('mid-project context', () => {
    it('includes canvas context in system prompt when provided', async () => {
      const canvasContext: CanvasContext = {
        blocks: [
          { type: 'Goal', content: 'Make a game' },
          { type: 'Skill', content: 'Move character' },
        ],
        hasGoal: true,
        promiseCount: 0,
        skillCount: 1,
        portalCount: 0,
        hasDeployTarget: false,
      };

      mockClaudeResponse(validTurnOutput());
      await service.startPlanning('session-mid', 'A game', canvasContext);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('Mid-Project Context');
      expect(callArgs.system).toContain('Make a game');
      expect(callArgs.system).toContain('Move character');
      expect(callArgs.system).toContain('Has goal: true');
      expect(callArgs.system).toContain('Skills: 1');
    });
  });

  // --- parseJsonResponse ---

  describe('JSON parsing', () => {
    it('parses raw JSON response', async () => {
      mockClaudeResponse(validTurnOutput());
      const result = await service.startPlanning('s1', 'idea');
      expect(result.message).toBeDefined();
    });

    it('parses fenced JSON response', async () => {
      const output = validTurnOutput();
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '```json\n' + JSON.stringify(output) + '\n```' }],
      });

      const result = await service.startPlanning('s2', 'idea');
      expect(result.message).toBe(output.message);
    });

    it('parses embedded JSON in prose', async () => {
      const output = validTurnOutput();
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Here is the output: ' + JSON.stringify(output) + ' Hope that helps!' }],
      });

      const result = await service.startPlanning('s3', 'idea');
      expect(result.message).toBe(output.message);
    });
  });

  // --- Teaching annotation ---

  describe('teaching annotation', () => {
    it('returns teaching annotation when Claude provides one', async () => {
      const output = validTurnOutput({
        teaching: {
          why_asking: 'This determines your deploy target',
          primitive_connection: ['Deploy', 'Portal'],
          pattern_spotted: null,
          what_if: 'What if you wanted both web and CLI?',
        },
      });
      mockClaudeResponse(output);

      const result = await service.startPlanning('session-teach', 'An app');

      expect(result.teaching).not.toBeNull();
      expect(result.teaching!.why_asking).toBe('This determines your deploy target');
      expect(result.teaching!.primitive_connection).toEqual(['Deploy', 'Portal']);
    });

    it('returns null teaching when not provided', async () => {
      mockClaudeResponse(validTurnOutput());

      const result = await service.startPlanning('session-no-teach', 'An app');
      expect(result.teaching).toBeNull();
    });
  });
});
