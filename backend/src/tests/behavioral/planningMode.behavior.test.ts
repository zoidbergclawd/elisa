/** Behavioral tests for the full Planning Mode pipeline (PRD-004). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PlanningService } from '../../services/planningService.js';
import type { PlanState } from '../../utils/planSchema.js';
import type { CanvasContext, PlanningMessage } from '../../models/planning.js';

// --- Mock the Anthropic client ---

const mockCreate = vi.fn();
vi.mock('../../utils/anthropicClient.js', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate },
  }),
}));

// --- Helpers ---

function makeTurnOutput(overrides: Record<string, unknown> = {}) {
  return {
    message: 'What kind of project is this?',
    question: {
      text: 'Project type?',
      type: 'single_select',
      options: [
        { label: 'Web app', value: 'web' },
        { label: 'CLI tool', value: 'cli' },
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
      goal: { description: 'Quiz app', confidence: 'rough' },
      promises: [],
      skills: [],
      portals: [],
      deploy: { target: null, constraints: [] },
      open_questions: [],
      ready: false,
      conversation_turn: 0,
    },
    teaching: null,
    ...overrides,
  };
}

function readyPlanState(): PlanState {
  return {
    idea: 'A quiz app',
    goal: { description: 'AI-powered science quiz', confidence: 'solid' },
    promises: [
      { description: 'Shows correct answers', category: 'behavior', proofs: [{ description: 'Answers displayed after each question' }] },
      { description: 'Tracks score across sessions', category: 'behavior', proofs: [{ description: 'Score persists between runs' }] },
    ],
    skills: [{ name: 'Generate quiz questions', description: 'Creates quiz from source material' }],
    portals: [{ name: 'Claude API', subtype: 'api', description: 'Reasoning and question generation' }],
    deploy: { target: 'web', constraints: ['Must work offline'] },
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

describe('Planning Mode behavioral tests', () => {
  let service: PlanningService;

  beforeEach(() => {
    service = new PlanningService('test-model');
    mockCreate.mockReset();
  });

  // ====================================================================
  // Full conversation flow
  // ====================================================================

  describe('full conversation lifecycle', () => {
    it('start -> question -> structured answer -> free-text -> ready -> generate', async () => {
      // Step 1: Start planning
      mockClaudeResponse(makeTurnOutput());
      const start = await service.startPlanning('s1', 'A quiz app');
      expect(start.status).toBe('active');
      expect(start.question).not.toBeNull();
      expect(start.message).toBeTruthy();

      // Step 2: Structured answer (no API call)
      const callCountBefore = mockCreate.mock.calls.length;
      const answer = service.handleStructuredAnswer('s1', 'web');
      expect(mockCreate.mock.calls.length).toBe(callCountBefore); // NO new API call
      expect(answer.plan.deploy.target).toBe('web');

      // Step 3: Free-text answer (API call)
      const secondTurn = makeTurnOutput({
        message: 'Science quizzes are awesome! What features do you want?',
        question: {
          text: 'Features?',
          type: 'multi_select',
          options: [
            { label: 'Multiple choice', value: 'mc' },
            { label: 'True/false', value: 'tf' },
            { label: 'Fill in blank', value: 'fib' },
          ],
        },
        plan_mutation_map: {
          mc: { 'skills.push': { name: 'Multiple choice', description: 'MC questions' } },
          tf: { 'skills.push': { name: 'True/false', description: 'TF questions' } },
          fib: null,
        },
        plan: {
          ...makeTurnOutput().plan,
          goal: { description: 'Science quiz app', confidence: 'solid' },
          deploy: { target: 'web', constraints: [] },
          conversation_turn: 1,
        },
      });
      mockClaudeResponse(secondTurn);
      const freeText = await service.handleFreeTextAnswer('s1', 'I want science quizzes');
      expect(freeText.message).toContain('Science quizzes');
      expect(freeText.question).not.toBeNull();

      // Step 4: Another turn that results in readiness
      const readyTurn = makeTurnOutput({
        message: 'Your plan looks complete! Let me generate the blocks.',
        question: null,
        plan_mutation_map: {},
        plan: readyPlanState(),
      });
      mockClaudeResponse(readyTurn);
      const ready = await service.handleFreeTextAnswer('s1', 'Sounds good!');
      expect(ready.status).toBe('ready');
      expect(ready.plan.ready).toBe(true);
      expect(ready.question).toBeNull();

      // Step 5: Generate canvas blocks (deterministic -- no Claude call needed)
      const blocks = await service.generateCanvas('s1');
      expect(blocks.blocks).toHaveLength(6);
      expect(blocks.blocks.map(b => b.type)).toEqual(
        expect.arrayContaining(['Goal', 'Promise', 'Skill', 'Portal', 'Deploy']),
      );
      // All proofs from the plan are included as children
      const promises = blocks.blocks.filter(b => b.type === 'Promise');
      expect(promises).toHaveLength(2);
      for (const p of promises) {
        expect(p.children?.length).toBeGreaterThanOrEqual(1);
      }

      // Verify final state
      const state = service.getState('s1')!;
      expect(state.status).toBe('generated');
      expect(state.generatedBlocks).toEqual(blocks);
      expect(state.conversationHistory.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ====================================================================
  // Deterministic mutation path
  // ====================================================================

  describe('deterministic mutation path', () => {
    it('structured answer applies mutation without any API call', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'A quiz app');
      const callsBefore = mockCreate.mock.calls.length;

      service.handleStructuredAnswer('s1', 'web');

      expect(mockCreate.mock.calls.length).toBe(callsBefore);
      expect(service.getState('s1')!.plan.deploy.target).toBe('web');
    });

    it('null mutation (unsure option) does not change plan', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'A quiz app');

      const planBefore = JSON.stringify(service.getState('s1')!.plan.deploy);
      service.handleStructuredAnswer('s1', 'unsure');
      const planAfter = JSON.stringify(service.getState('s1')!.plan.deploy);

      expect(planAfter).toBe(planBefore);
    });

    it('push mutation appends to arrays', async () => {
      const output = makeTurnOutput({
        plan_mutation_map: {
          add_auth: { 'promises.push': { description: 'User must log in', category: 'security', proofs: [] } },
        },
        question: {
          text: 'Security?',
          type: 'single_select',
          options: [
            { label: 'Add auth', value: 'add_auth' },
            { label: 'Skip', value: 'skip' },
          ],
        },
      });
      mockClaudeResponse(output);
      await service.startPlanning('s1', 'App');

      const promisesBefore = service.getState('s1')!.plan.promises.length;
      service.handleStructuredAnswer('s1', 'add_auth');
      const promisesAfter = service.getState('s1')!.plan.promises.length;

      expect(promisesAfter).toBe(promisesBefore + 1);
      expect(service.getState('s1')!.plan.promises[promisesAfter - 1].description).toBe('User must log in');
    });

    it('nested dot-notation sets deeply nested values', async () => {
      const output = makeTurnOutput({
        plan_mutation_map: {
          solid: { 'goal.confidence': 'solid', 'goal.description': 'Refined goal' },
        },
        question: {
          text: 'Is the goal clear?',
          type: 'single_select',
          options: [
            { label: 'Yes, solid', value: 'solid' },
            { label: 'Not yet', value: 'no' },
          ],
        },
      });
      mockClaudeResponse(output);
      await service.startPlanning('s1', 'App');

      service.handleStructuredAnswer('s1', 'solid');

      expect(service.getState('s1')!.plan.goal.confidence).toBe('solid');
      expect(service.getState('s1')!.plan.goal.description).toBe('Refined goal');
    });

    it('increments conversation_turn on structured answer', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');
      const turnBefore = service.getState('s1')!.plan.conversation_turn;

      service.handleStructuredAnswer('s1', 'web');

      expect(service.getState('s1')!.plan.conversation_turn).toBe(turnBefore + 1);
    });

    it('records kid answer in conversation history', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');
      const historyBefore = service.getState('s1')!.conversationHistory.length;

      service.handleStructuredAnswer('s1', 'web');

      const history = service.getState('s1')!.conversationHistory;
      expect(history.length).toBe(historyBefore + 1);
      expect(history[history.length - 1].role).toBe('kid');
      expect(history[history.length - 1].content).toBe('web');
    });
  });

  // ====================================================================
  // Mid-project context
  // ====================================================================

  describe('mid-project context', () => {
    it('includes canvas context in system prompt when provided', async () => {
      const canvasContext: CanvasContext = {
        blocks: [
          { type: 'Goal', content: 'Weather dashboard' },
          { type: 'Portal', content: 'OpenWeather API', subtype: 'api' },
          { type: 'Skill', content: 'Fetch temperature' },
        ],
        hasGoal: true,
        promiseCount: 0,
        skillCount: 1,
        portalCount: 1,
        hasDeployTarget: false,
      };

      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'Weather dashboard', canvasContext);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('Mid-Project Context');
      expect(callArgs.system).toContain('Weather dashboard');
      expect(callArgs.system).toContain('OpenWeather API');
      expect(callArgs.system).toContain('Fetch temperature');
      expect(callArgs.system).toContain('Has goal: true');
      expect(callArgs.system).toContain('Skills: 1');
      expect(callArgs.system).toContain('Portals: 1');
    });

    it('does not include mid-project section without canvas context', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'New project');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).not.toContain('Mid-Project Context');
    });

    it('includes current plan state JSON in system prompt', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toContain('Current Plan State');
      expect(callArgs.system).toContain('"idea"');
    });

    it('stores canvas context on session for later use', async () => {
      const ctx: CanvasContext = {
        blocks: [{ type: 'Goal', content: 'Test' }],
        hasGoal: true,
        promiseCount: 0,
        skillCount: 0,
        portalCount: 0,
        hasDeployTarget: false,
      };

      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'Test', ctx);

      expect(service.getState('s1')!.canvasContext).toEqual(ctx);
    });
  });

  // ====================================================================
  // Readiness criteria
  // ====================================================================

  describe('readiness criteria', () => {
    it('returns true when all criteria are met', () => {
      expect(service.checkReadiness(readyPlanState())).toBe(true);
    });

    const criteriaTests: Array<[string, (plan: PlanState) => void]> = [
      ['goal confidence not solid', (p) => { p.goal.confidence = 'rough'; }],
      ['fewer than 2 promises', (p) => { p.promises = [p.promises[0]]; }],
      ['promise missing proof', (p) => { p.promises[1].proofs = []; }],
      ['no portals', (p) => { p.portals = []; }],
      ['no skills', (p) => { p.skills = []; }],
      ['no deploy target', (p) => { p.deploy.target = null; }],
      ['open questions remain', (p) => { p.open_questions = ['What about mobile?']; }],
    ];

    for (const [label, mutator] of criteriaTests) {
      it(`returns false when ${label}`, () => {
        const plan = readyPlanState();
        mutator(plan);
        expect(service.checkReadiness(plan)).toBe(false);
      });
    }

    it('structured answer triggers readiness when final gap is filled', async () => {
      // Plan missing only deploy target
      const nearReady = makeTurnOutput({
        plan: {
          ...readyPlanState(),
          deploy: { target: null, constraints: [] },
          ready: false,
        },
        plan_mutation_map: {
          web: { 'deploy.target': 'web' },
        },
        question: {
          text: 'Where to deploy?',
          type: 'single_select',
          options: [
            { label: 'Web', value: 'web' },
            { label: 'CLI', value: 'cli' },
          ],
        },
      });
      mockClaudeResponse(nearReady);
      await service.startPlanning('s1', 'App');

      const result = service.handleStructuredAnswer('s1', 'web');
      expect(result.status).toBe('ready');
      expect(result.plan.ready).toBe(true);
    });

    it('Claude returning null question sets ready', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      const readyTurn = makeTurnOutput({
        question: null,
        plan_mutation_map: {},
        plan: { ...readyPlanState(), ready: false },
      });
      mockClaudeResponse(readyTurn);
      const result = await service.handleFreeTextAnswer('s1', 'Done');

      expect(result.status).toBe('ready');
      expect(result.plan.ready).toBe(true);
    });
  });

  // ====================================================================
  // Turn cap
  // ====================================================================

  describe('turn cap at 20', () => {
    it('forces readiness when conversation_turn reaches max', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      // Manually set conversation_turn to max
      const state = service.getState('s1')!;
      state.plan.conversation_turn = 20;

      const result = await service.handleFreeTextAnswer('s1', 'More details');

      expect(result.status).toBe('ready');
      expect(result.plan.ready).toBe(true);
      expect(result.question).toBeNull();
      expect(result.message).toContain('planning for a while');
    });

    it('does not make API call when turn cap is hit', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      service.getState('s1')!.plan.conversation_turn = 20;
      const callsBefore = mockCreate.mock.calls.length;

      await service.handleFreeTextAnswer('s1', 'More');

      expect(mockCreate.mock.calls.length).toBe(callsBefore);
    });
  });

  // ====================================================================
  // Error handling
  // ====================================================================

  describe('error handling', () => {
    it('retries once on invalid JSON response, succeeds on retry', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      // Invalid response then valid retry
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'not JSON' }],
      });
      mockClaudeResponse(makeTurnOutput({ message: 'Retried successfully!' }));

      const result = await service.handleFreeTextAnswer('s1', 'Tell me more');
      expect(result.message).toBe('Retried successfully!');
    });

    it('throws after retry also fails', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'garbage' }],
      });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'still garbage' }],
      });

      await expect(service.handleFreeTextAnswer('s1', 'hello')).rejects.toThrow(
        /failed to produce valid JSON/i,
      );
    });

    it('throws for missing session on structured answer', () => {
      expect(() => service.handleStructuredAnswer('nonexistent', 'web')).toThrow(
        /No planning session/,
      );
    });

    it('throws for missing session on free-text answer', async () => {
      await expect(service.handleFreeTextAnswer('nonexistent', 'hi')).rejects.toThrow(
        /No planning session/,
      );
    });

    it('throws for missing session on generateCanvas', async () => {
      await expect(service.generateCanvas('nonexistent')).rejects.toThrow(
        /No planning session/,
      );
    });

    it('throws when generating canvas for non-ready plan', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      await expect(service.generateCanvas('s1')).rejects.toThrow(
        /not ready/,
      );
    });

    it('deterministically generates all plan data including proofs', async () => {
      const readyTurn = makeTurnOutput({
        question: null,
        plan: readyPlanState(),
      });
      mockClaudeResponse(readyTurn);
      await service.startPlanning('s1', 'App');

      // No Claude call needed -- deterministic conversion
      const result = await service.generateCanvas('s1');
      expect(result.blocks[0].type).toBe('Goal');
      const promises = result.blocks.filter(b => b.type === 'Promise');
      for (const p of promises) {
        expect(p.children?.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('throws when starting planning twice for same session', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      await expect(service.startPlanning('s1', 'Another')).rejects.toThrow(
        /already exists/,
      );
    });

    it('throws when answering with no active mutation map', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');
      service.handleStructuredAnswer('s1', 'web'); // clears the map

      expect(() => service.handleStructuredAnswer('s1', 'cli')).toThrow(
        /No active question/,
      );
    });

    it('parses fenced JSON response from Claude', async () => {
      const output = makeTurnOutput({ message: 'From fenced response' });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '```json\n' + JSON.stringify(output) + '\n```' }],
      });

      const result = await service.startPlanning('s-fenced', 'App');
      expect(result.message).toBe('From fenced response');
    });

    it('parses embedded JSON in prose from Claude', async () => {
      const output = makeTurnOutput({ message: 'From embedded' });
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Here is my response: ' + JSON.stringify(output) + ' Hope this helps!' }],
      });

      const result = await service.startPlanning('s-embed', 'App');
      expect(result.message).toBe('From embedded');
    });
  });

  // ====================================================================
  // Persistence round-trip
  // ====================================================================

  describe('persistence', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-plan-behav-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('save/load round-trip preserves plan state and conversation', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'Quiz app');
      service.handleStructuredAnswer('s1', 'web');

      service.savePlan('s1', tmpDir);

      const originalState = service.getState('s1')!;
      const originalPlan = JSON.parse(JSON.stringify(originalState.plan));
      const originalHistoryLen = originalState.conversationHistory.length;
      service.deleteSession('s1');

      const loaded = service.loadPlan('s-restored', tmpDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.plan.idea).toBe(originalPlan.idea);
      expect(loaded!.plan.deploy.target).toBe(originalPlan.deploy.target);
      expect(loaded!.conversationHistory.length).toBe(originalHistoryLen);
    });

    it('resume with canvas context after load', async () => {
      const ctx: CanvasContext = {
        blocks: [{ type: 'Goal', content: 'Test goal' }],
        hasGoal: true,
        promiseCount: 0,
        skillCount: 0,
        portalCount: 0,
        hasDeployTarget: false,
      };
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'Test', ctx);

      service.savePlan('s1', tmpDir);
      service.deleteSession('s1');

      const loaded = service.loadPlan('s-ctx', tmpDir);
      expect(loaded!.canvasContext!.hasGoal).toBe(true);
    });

    it('load returns null for missing file (graceful)', () => {
      const result = service.loadPlan('s1', tmpDir);
      expect(result).toBeNull();
    });

    it('load returns null for corrupt file (graceful)', () => {
      const elisaDir = path.join(tmpDir, '.elisa');
      fs.mkdirSync(elisaDir, { recursive: true });
      fs.writeFileSync(path.join(elisaDir, 'plan.json'), '{broken json!!!');

      const result = service.loadPlan('s1', tmpDir);
      expect(result).toBeNull();
    });

    it('subsequent saves overwrite previous data', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      service.savePlan('s1', tmpDir);
      service.handleStructuredAnswer('s1', 'web');
      service.savePlan('s1', tmpDir);

      service.deleteSession('s1');
      const loaded = service.loadPlan('s-check', tmpDir);
      expect(loaded!.plan.deploy.target).toBe('web');
    });

    it('resume planning allows continuation after load', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');
      service.savePlan('s1', tmpDir);
      service.deleteSession('s1');

      service.loadPlan('s-resume', tmpDir);

      // Should be able to continue with free-text
      mockClaudeResponse(makeTurnOutput({ message: 'Resumed!' }));
      const result = await service.handleFreeTextAnswer('s-resume', 'Continue');
      expect(result.message).toBe('Resumed!');
    });

    it('preserves ready status through save/load', async () => {
      const readyTurn = makeTurnOutput({
        question: null,
        plan: readyPlanState(),
      });
      mockClaudeResponse(readyTurn);
      await service.startPlanning('s1', 'App');

      service.savePlan('s1', tmpDir);
      service.deleteSession('s1');

      const loaded = service.loadPlan('s-ready', tmpDir);
      expect(loaded!.status).toBe('ready');
      expect(loaded!.plan.ready).toBe(true);
    });
  });

  // ====================================================================
  // Conversation history tracking
  // ====================================================================

  describe('conversation history', () => {
    it('tracks alternating kid/agent messages', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      const history = service.getState('s1')!.conversationHistory;
      expect(history[0].role).toBe('kid');
      expect(history[0].content).toContain('I want to build');
      expect(history[1].role).toBe('agent');
      expect(history[1].content).toBe('What kind of project is this?');
    });

    it('stores question widget on agent messages', async () => {
      mockClaudeResponse(makeTurnOutput());
      await service.startPlanning('s1', 'App');

      const agentMsg = service.getState('s1')!.conversationHistory
        .find(m => m.role === 'agent');
      expect(agentMsg!.question).toBeDefined();
      expect(agentMsg!.question!.type).toBe('single_select');
    });

    it('stores teaching annotation on agent messages when present', async () => {
      const output = makeTurnOutput({
        teaching: {
          why_asking: 'Deploy affects portals',
          primitive_connection: ['Deploy', 'Portal'],
          pattern_spotted: null,
          what_if: 'What if you needed mobile too?',
        },
      });
      mockClaudeResponse(output);
      await service.startPlanning('s1', 'App');

      const agentMsg = service.getState('s1')!.conversationHistory
        .find(m => m.role === 'agent');
      expect(agentMsg!.teaching).not.toBeNull();
      expect(agentMsg!.teaching!.why_asking).toBe('Deploy affects portals');
    });
  });

  // ====================================================================
  // Multiple sessions
  // ====================================================================

  describe('multiple sessions', () => {
    it('supports concurrent independent planning sessions', async () => {
      mockClaudeResponse(makeTurnOutput({ plan: { ...makeTurnOutput().plan, idea: 'App A' } }));
      mockClaudeResponse(makeTurnOutput({ plan: { ...makeTurnOutput().plan, idea: 'App B' } }));

      await service.startPlanning('s-a', 'App A');
      await service.startPlanning('s-b', 'App B');

      expect(service.getState('s-a')!.plan.idea).toBe('App A');
      expect(service.getState('s-b')!.plan.idea).toBe('App B');
    });

    it('deleting one session does not affect others', async () => {
      mockClaudeResponse(makeTurnOutput());
      mockClaudeResponse(makeTurnOutput());

      await service.startPlanning('s-a', 'App A');
      await service.startPlanning('s-b', 'App B');

      service.deleteSession('s-a');
      expect(service.getState('s-a')).toBeUndefined();
      expect(service.getState('s-b')).toBeDefined();
    });
  });
});
