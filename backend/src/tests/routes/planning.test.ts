/** Tests for Planning Mode route handlers: /api/sessions/:id/planning/* */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createPlanningRouter, buildPlanningReplayEvents } from '../../routes/planning.js';
import { PlanningService } from '../../services/planningService.js';
import type { SessionStore } from '../../services/sessionStore.js';
import type { WSEvent } from '../../services/phases/types.js';

// Mock the Anthropic client for PlanningService
const mockCreate = vi.fn();
vi.mock('../../utils/anthropicClient.js', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate },
  }),
}));

function validTurnOutput(overrides: Record<string, unknown> = {}) {
  return {
    message: 'Great idea! What kind of project?',
    question: {
      text: 'What type?',
      type: 'single_select',
      options: [
        { label: 'Web app', value: 'web' },
        { label: 'CLI tool', value: 'cli' },
      ],
    },
    plan_mutation_map: {
      web: { 'deploy.target': 'web' },
      cli: { 'deploy.target': 'cli' },
    },
    plan: {
      idea: 'A quiz app',
      goal: { description: 'A quiz app', confidence: 'rough' },
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

function mockClaudeResponse(output: Record<string, unknown>) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify(output) }],
  });
}

function createMockStore(): SessionStore {
  const entries = new Map<string, any>();
  return {
    create: vi.fn((id: string, session: any) => {
      const entry = {
        session,
        orchestrator: null,
        skillRunner: null,
        cancelFn: null,
        createdAt: Date.now(),
        userWorkspace: false,
        launchProcess: null,
      };
      entries.set(id, entry);
      return entry;
    }),
    get: vi.fn((id: string) => entries.get(id)),
    has: vi.fn((id: string) => entries.has(id)),
    scheduleCleanup: vi.fn(),
  } as unknown as SessionStore;
}

function makeApp(
  store: SessionStore,
  planningService: PlanningService,
  sendEvent: (id: string, evt: WSEvent) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  const router = createPlanningRouter({ store, planningService, sendEvent });
  app.use('/api/sessions/:id/planning', router);
  return app;
}

async function listen(app: express.Application): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

describe('Planning routes', () => {
  let store: SessionStore;
  let planningService: PlanningService;
  let sendEvent: ReturnType<typeof vi.fn>;
  let app: express.Application;
  let server: http.Server;
  let port: number;
  const sessionId = 'test-session';

  beforeEach(async () => {
    mockCreate.mockReset();
    store = createMockStore();
    planningService = new PlanningService('test-model');
    sendEvent = vi.fn().mockResolvedValue(undefined);
    app = makeApp(store, planningService, sendEvent);
    const result = await listen(app);
    server = result.server;
    port = result.port;

    // Create a session in the mock store
    store.create(sessionId, {
      id: sessionId,
      state: 'idle',
      spec: null,
      tasks: [],
      agents: [],
    });
  });

  afterEach(() => {
    server?.close();
  });

  function url(path: string) {
    return `http://127.0.0.1:${port}${path}`;
  }

  // --- GET /api/sessions/:id/planning ---

  describe('GET /planning', () => {
    it('returns idle state when no planning session exists', async () => {
      const res = await fetch(url(`/api/sessions/${sessionId}/planning`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('idle');
      expect(body.plan).toBeNull();
    });

    it('returns current state after planning starts', async () => {
      mockClaudeResponse(validTurnOutput());
      await planningService.startPlanning(sessionId, 'A quiz app');

      const res = await fetch(url(`/api/sessions/${sessionId}/planning`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('active');
      expect(body.plan).toBeDefined();
      expect(body.currentQuestion).toBeDefined();
    });

    it('returns 404 for unknown session', async () => {
      const res = await fetch(url('/api/sessions/unknown/planning'));
      expect(res.status).toBe(404);
    });
  });

  // --- POST /api/sessions/:id/planning/start ---

  describe('POST /planning/start', () => {
    it('starts planning and emits WS events', async () => {
      mockClaudeResponse(validTurnOutput());

      const res = await fetch(url(`/api/sessions/${sessionId}/planning/start`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: 'A quiz app' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Great idea! What kind of project?');
      expect(body.question).toBeDefined();
      expect(body.plan).toBeDefined();

      // Verify WS events emitted
      const eventTypes = sendEvent.mock.calls.map((c: any[]) => c[1].type);
      expect(eventTypes).toContain('planning_mode_started');
      expect(eventTypes).toContain('planning_turn');
      expect(eventTypes).toContain('planning_plan_updated');
      expect(eventTypes).toContain('planning_question');
    });

    it('returns 400 when idea is missing', async () => {
      const res = await fetch(url(`/api/sessions/${sessionId}/planning/start`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.detail).toContain('idea');
    });

    it('returns 404 for unknown session', async () => {
      const res = await fetch(url('/api/sessions/unknown/planning/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: 'test' }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 500 when planning session already exists', async () => {
      mockClaudeResponse(validTurnOutput());
      await planningService.startPlanning(sessionId, 'First idea');

      const res = await fetch(url(`/api/sessions/${sessionId}/planning/start`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: 'Second idea' }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.detail).toContain('already exists');
    });

    it('emits teaching event when teaching annotation is present', async () => {
      mockClaudeResponse(validTurnOutput({
        teaching: {
          why_asking: 'Deploy target matters',
          primitive_connection: ['Deploy'],
          pattern_spotted: null,
          what_if: null,
        },
      }));

      await fetch(url(`/api/sessions/${sessionId}/planning/start`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: 'A quiz app' }),
      });

      const eventTypes = sendEvent.mock.calls.map((c: any[]) => c[1].type);
      expect(eventTypes).toContain('planning_teaching');
    });
  });

  // --- POST /api/sessions/:id/planning/answer ---

  describe('POST /planning/answer', () => {
    it('applies structured answer and emits plan update', async () => {
      mockClaudeResponse(validTurnOutput());
      await planningService.startPlanning(sessionId, 'A quiz app');
      sendEvent.mockClear();

      const res = await fetch(url(`/api/sessions/${sessionId}/planning/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionValue: 'web' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.plan.deploy.target).toBe('web');

      const eventTypes = sendEvent.mock.calls.map((c: any[]) => c[1].type);
      expect(eventTypes).toContain('planning_plan_updated');
    });

    it('returns 400 when optionValue is missing', async () => {
      mockClaudeResponse(validTurnOutput());
      await planningService.startPlanning(sessionId, 'A quiz app');

      const res = await fetch(url(`/api/sessions/${sessionId}/planning/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown session', async () => {
      const res = await fetch(url('/api/sessions/unknown/planning/answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionValue: 'web' }),
      });

      expect(res.status).toBe(404);
    });
  });

  // --- POST /api/sessions/:id/planning/message ---

  describe('POST /planning/message', () => {
    it('sends free-text to Claude and emits events', async () => {
      mockClaudeResponse(validTurnOutput());
      await planningService.startPlanning(sessionId, 'A quiz app');
      sendEvent.mockClear();

      const secondOutput = validTurnOutput({
        message: 'Science quizzes, cool!',
      });
      mockClaudeResponse(secondOutput);

      const res = await fetch(url(`/api/sessions/${sessionId}/planning/message`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Science quizzes' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.message).toBe('Science quizzes, cool!');

      const eventTypes = sendEvent.mock.calls.map((c: any[]) => c[1].type);
      expect(eventTypes).toContain('planning_turn');
      expect(eventTypes).toContain('planning_plan_updated');
    });

    it('returns 400 when text is missing', async () => {
      const res = await fetch(url(`/api/sessions/${sessionId}/planning/message`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown session', async () => {
      const res = await fetch(url('/api/sessions/unknown/planning/message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello' }),
      });

      expect(res.status).toBe(404);
    });
  });

  // --- POST /api/sessions/:id/planning/generate ---

  describe('POST /planning/generate', () => {
    it('generates canvas blocks and emits event', async () => {
      // Start with a ready plan
      const readyOutput = validTurnOutput({
        plan: {
          idea: 'Quiz app',
          goal: { description: 'Quiz app', confidence: 'solid' },
          promises: [
            { description: 'Shows answers', category: 'behavior', proofs: [{ description: 'Check' }] },
            { description: 'Tracks score', category: 'behavior', proofs: [{ description: 'Score' }] },
          ],
          skills: [{ name: 'Generate', description: 'Makes questions' }],
          portals: [{ name: 'API', subtype: 'api', description: 'AI' }],
          deploy: { target: 'web', constraints: [] },
          open_questions: [],
          ready: true,
          conversation_turn: 4,
        },
        question: null,
      });
      mockClaudeResponse(readyOutput);
      await planningService.startPlanning(sessionId, 'Quiz app');
      sendEvent.mockClear();

      // generateCanvas is deterministic (no Claude call) -- plan has:
      // 1 Goal + 2 Promises + 1 Skill + 1 Deploy = 5 blocks
      const res = await fetch(url(`/api/sessions/${sessionId}/planning/generate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.blocks.blocks).toHaveLength(5);

      const eventTypes = sendEvent.mock.calls.map((c: any[]) => c[1].type);
      expect(eventTypes).toContain('planning_canvas_generated');
    });

    it('returns 500 when plan is not ready', async () => {
      mockClaudeResponse(validTurnOutput());
      await planningService.startPlanning(sessionId, 'Quiz app');

      const res = await fetch(url(`/api/sessions/${sessionId}/planning/generate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.detail).toContain('not ready');
    });

    it('returns 404 for unknown session', async () => {
      const res = await fetch(url('/api/sessions/unknown/planning/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(res.status).toBe(404);
    });
  });

  // --- State guards ---

  describe('state guards', () => {
    it('answer returns 500 before planning is started (no planning session)', async () => {
      const res = await fetch(url(`/api/sessions/${sessionId}/planning/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionValue: 'web' }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.detail).toContain('No planning session');
    });

    it('message returns 500 before planning is started', async () => {
      const res = await fetch(url(`/api/sessions/${sessionId}/planning/message`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello' }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.detail).toContain('No planning session');
    });

    it('generate returns 500 before planning is started', async () => {
      const res = await fetch(url(`/api/sessions/${sessionId}/planning/generate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.detail).toContain('No planning session');
    });

    it('answer returns 500 when no active question (mutation map cleared)', async () => {
      mockClaudeResponse(validTurnOutput());
      await planningService.startPlanning(sessionId, 'A quiz app');

      // Answer once to clear mutation map
      planningService.handleStructuredAnswer(sessionId, 'web');

      const res = await fetch(url(`/api/sessions/${sessionId}/planning/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionValue: 'cli' }),
      });

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.detail).toContain('No active question');
    });

    it('emits planning_error event on failure', async () => {
      const res = await fetch(url(`/api/sessions/${sessionId}/planning/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionValue: 'web' }),
      });

      expect(res.status).toBe(500);
      const errorEvents = sendEvent.mock.calls
        .filter((c: any[]) => c[1].type === 'planning_error');
      expect(errorEvents.length).toBeGreaterThan(0);
    });
  });
});

// --- Reconnection replay ---

describe('buildPlanningReplayEvents', () => {
  let planningService: PlanningService;

  beforeEach(() => {
    mockCreate.mockReset();
    planningService = new PlanningService('test-model');
  });

  it('returns empty array when no planning session', () => {
    const events = buildPlanningReplayEvents(planningService, 'nonexistent');
    expect(events).toEqual([]);
  });

  it('returns replay events for active planning session', async () => {
    mockClaudeResponse({
      message: 'Welcome! What would you like to build?',
      question: {
        text: 'What type?',
        type: 'single_select',
        options: [
          { label: 'Web', value: 'web' },
          { label: 'CLI', value: 'cli' },
        ],
      },
      plan_mutation_map: { web: { 'deploy.target': 'web' }, cli: { 'deploy.target': 'cli' } },
      plan: {
        idea: 'test',
        goal: { description: null, confidence: 'vague' },
        promises: [],
        skills: [],
        portals: [],
        deploy: { target: null, constraints: [] },
        open_questions: [],
        ready: false,
        conversation_turn: 0,
      },
    });
    await planningService.startPlanning('session-1', 'test');

    const events = buildPlanningReplayEvents(planningService, 'session-1');

    const types = events.map(e => e.type);
    expect(types).toContain('planning_mode_started');
    expect(types).toContain('planning_plan_updated');
    expect(types).toContain('planning_question');
    expect(types).toContain('planning_turn');
  });

  it('includes ready event when plan is ready', async () => {
    const readyPlan = {
      idea: 'test',
      goal: { description: 'Test', confidence: 'solid' },
      promises: [
        { description: 'P1', category: 'behavior', proofs: [{ description: 'Proof' }] },
        { description: 'P2', category: 'behavior', proofs: [{ description: 'Proof' }] },
      ],
      skills: [{ name: 'S1', description: 'Skill' }],
      portals: [{ name: 'P1', subtype: 'api', description: 'Portal' }],
      deploy: { target: 'web', constraints: [] },
      open_questions: [],
      ready: true,
      conversation_turn: 5,
    };

    mockClaudeResponse({
      message: 'All set!',
      question: null,
      plan_mutation_map: {},
      plan: readyPlan,
    });
    await planningService.startPlanning('session-ready', 'test');

    const events = buildPlanningReplayEvents(planningService, 'session-ready');
    const types = events.map(e => e.type);
    expect(types).toContain('planning_ready');
  });
});
