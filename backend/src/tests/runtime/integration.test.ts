/** Integration tests for PRD-001 Phase 2 wiring: backpack endpoints,
 *  study mode endpoints, content filter in turn pipeline,
 *  usage limiter in turn pipeline, and agent deletion cascade. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import { AgentStore } from '../../services/runtime/agentStore.js';
import { ConversationManager } from '../../services/runtime/conversationManager.js';
import { TurnPipeline, UsageTracker } from '../../services/runtime/turnPipeline.js';
import { KnowledgeBackpack } from '../../services/runtime/knowledgeBackpack.js';
import { StudyMode } from '../../services/runtime/studyMode.js';
import { UsageLimiter } from '../../services/runtime/usageLimiter.js';
import { LocalRuntimeProvisioner } from '../../services/runtimeProvisioner.js';
import { createRuntimeRouter } from '../../routes/runtime.js';

// ── Mock Anthropic Client ────────────────────────────────────────────

function createMockClient(responseText = 'Mock response from Claude') {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as any;
}

// ── Test Setup ───────────────────────────────────────────────────────

let server: http.Server | null = null;
let baseUrl = '';
let agentStore: AgentStore;
let conversationManager: ConversationManager;
let turnPipeline: TurnPipeline;
let knowledgeBackpack: KnowledgeBackpack;
let studyMode: StudyMode;
let mockClient: any;

function createTestApp() {
  agentStore = new AgentStore('http://localhost:8000');
  conversationManager = new ConversationManager();
  knowledgeBackpack = new KnowledgeBackpack();
  studyMode = new StudyMode(knowledgeBackpack);
  mockClient = createMockClient();

  turnPipeline = new TurnPipeline(
    {
      agentStore,
      conversationManager,
      getClient: () => mockClient,
      knowledgeBackpack,
    },
    new UsageTracker(),
  );

  const app = express();
  app.use(express.json());
  app.use('/v1', createRuntimeRouter({
    agentStore,
    conversationManager,
    turnPipeline,
    knowledgeBackpack,
    studyMode,
  }));
  return app;
}

async function fetchJSON(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function makeSpec(): Record<string, any> {
  return {
    nugget: { goal: 'Help kids learn about dinosaurs' },
    runtime: {
      agent_name: 'Dino Bot',
      greeting: 'Roar! Hello!',
      fallback_response: "Hmm, I'm not sure about that...",
    },
  };
}

async function provisionAgent(): Promise<{ agent_id: string; api_key: string }> {
  const { body } = await fetchJSON('/v1/agents', {
    method: 'POST',
    body: JSON.stringify(makeSpec()),
  });
  return body;
}

beforeEach(async () => {
  const app = createTestApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      const addr = server!.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

// ── Knowledge Backpack Endpoints ─────────────────────────────────────

describe('Knowledge Backpack endpoints', () => {
  it('adds a source and lists it', async () => {
    const { agent_id, api_key } = await provisionAgent();

    // Add a source
    const { status: addStatus, body: addBody } = await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Dinosaur Facts',
        content: 'T-Rex was a large carnivorous dinosaur that lived during the Cretaceous period.',
        source_type: 'manual',
      }),
      headers: { 'x-api-key': api_key },
    });

    expect(addStatus).toBe(201);
    expect(addBody.source_id).toBeDefined();
    expect(addBody.agent_id).toBe(agent_id);

    // List sources
    const { status: listStatus, body: listBody } = await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      headers: { 'x-api-key': api_key },
    });

    expect(listStatus).toBe(200);
    expect(listBody.sources).toHaveLength(1);
    expect(listBody.sources[0].title).toBe('Dinosaur Facts');
  });

  it('searches backpack sources by keyword', async () => {
    const { agent_id, api_key } = await provisionAgent();

    // Add two sources
    await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Dinosaur Facts',
        content: 'T-Rex was a large carnivorous dinosaur.',
      }),
      headers: { 'x-api-key': api_key },
    });
    await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Ocean Life',
        content: 'Whales are the largest marine mammals.',
      }),
      headers: { 'x-api-key': api_key },
    });

    // Search for dinosaur content
    const { status, body } = await fetchJSON(`/v1/agents/${agent_id}/backpack/search`, {
      method: 'POST',
      body: JSON.stringify({ query: 'dinosaur carnivorous' }),
      headers: { 'x-api-key': api_key },
    });

    expect(status).toBe(200);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].title).toBe('Dinosaur Facts');
  });

  it('removes a source', async () => {
    const { agent_id, api_key } = await provisionAgent();

    const { body: addBody } = await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Temp', content: 'Temporary content' }),
      headers: { 'x-api-key': api_key },
    });

    const { status } = await fetchJSON(`/v1/agents/${agent_id}/backpack/${addBody.source_id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': api_key },
    });

    expect(status).toBe(200);

    // Verify it's gone
    const { body: listBody } = await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      headers: { 'x-api-key': api_key },
    });
    expect(listBody.sources).toHaveLength(0);
  });

  it('returns 401 without api key', async () => {
    const { agent_id } = await provisionAgent();

    const { status } = await fetchJSON(`/v1/agents/${agent_id}/backpack`);
    expect(status).toBe(401);
  });

  it('returns 400 when title is missing on add', async () => {
    const { agent_id, api_key } = await provisionAgent();

    const { status } = await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({ content: 'No title here' }),
      headers: { 'x-api-key': api_key },
    });

    expect(status).toBe(400);
  });
});

// ── Study Mode Endpoints ─────────────────────────────────────────────

describe('Study Mode endpoints', () => {
  it('enables study mode and retrieves config + progress', async () => {
    const { agent_id, api_key } = await provisionAgent();

    // Enable study mode
    const { status: enableStatus } = await fetchJSON(`/v1/agents/${agent_id}/study`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: true, style: 'quiz', difficulty: 'easy' }),
      headers: { 'x-api-key': api_key },
    });

    expect(enableStatus).toBe(200);

    // Get config + progress
    const { status, body } = await fetchJSON(`/v1/agents/${agent_id}/study`, {
      headers: { 'x-api-key': api_key },
    });

    expect(status).toBe(200);
    expect(body.config.enabled).toBe(true);
    expect(body.config.difficulty).toBe('easy');
    expect(body.progress.total_questions).toBe(0);
  });

  it('generates quiz and submits answer via endpoints', async () => {
    const { agent_id, api_key } = await provisionAgent();

    // Add backpack content first
    await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Dinosaur Facts',
        content: 'T-Rex lived 68 million years ago during the Cretaceous period.',
      }),
      headers: { 'x-api-key': api_key },
    });
    await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Space Facts',
        content: 'The sun is a medium-sized yellow star in our solar system.',
      }),
      headers: { 'x-api-key': api_key },
    });

    // Enable study mode
    await fetchJSON(`/v1/agents/${agent_id}/study`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: true, style: 'quiz', difficulty: 'medium' }),
      headers: { 'x-api-key': api_key },
    });

    // Generate quiz
    const { status: quizStatus, body: quizBody } = await fetchJSON(`/v1/agents/${agent_id}/study/quiz`, {
      method: 'POST',
      headers: { 'x-api-key': api_key },
    });

    expect(quizStatus).toBe(200);
    expect(quizBody.id).toBeDefined();
    expect(quizBody.question).toBeDefined();
    expect(quizBody.options.length).toBeGreaterThan(0);
    expect(typeof quizBody.correct_index).toBe('number');

    // Submit correct answer
    const { status: answerStatus, body: answerBody } = await fetchJSON(`/v1/agents/${agent_id}/study/answer`, {
      method: 'POST',
      body: JSON.stringify({ question_id: quizBody.id, answer: quizBody.correct_index }),
      headers: { 'x-api-key': api_key },
    });

    expect(answerStatus).toBe(200);
    expect(answerBody.correct).toBe(true);

    // Check progress
    const { body: progressBody } = await fetchJSON(`/v1/agents/${agent_id}/study`, {
      headers: { 'x-api-key': api_key },
    });

    expect(progressBody.progress.total_questions).toBe(1);
    expect(progressBody.progress.correct_answers).toBe(1);
  });

  it('disables study mode', async () => {
    const { agent_id, api_key } = await provisionAgent();

    await fetchJSON(`/v1/agents/${agent_id}/study`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
      headers: { 'x-api-key': api_key },
    });

    const { status } = await fetchJSON(`/v1/agents/${agent_id}/study`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
      headers: { 'x-api-key': api_key },
    });

    expect(status).toBe(200);

    const { body } = await fetchJSON(`/v1/agents/${agent_id}/study`, {
      headers: { 'x-api-key': api_key },
    });

    expect(body.config.enabled).toBe(false);
  });

  it('returns 404 for quiz when study mode not enabled', async () => {
    const { agent_id, api_key } = await provisionAgent();

    const { status } = await fetchJSON(`/v1/agents/${agent_id}/study/quiz`, {
      method: 'POST',
      headers: { 'x-api-key': api_key },
    });

    expect(status).toBe(404);
  });
});

// ── LocalRuntimeProvisioner ──────────────────────────────────────────

describe('LocalRuntimeProvisioner', () => {
  it('provisions via AgentStore directly', async () => {
    const store = new AgentStore('http://localhost:8000');
    const provisioner = new LocalRuntimeProvisioner(store);

    const result = await provisioner.provision({
      nugget: { goal: 'Test agent' },
      runtime: { agent_name: 'Test Bot' },
    });

    expect(result.agent_id).toBeDefined();
    expect(result.api_key).toMatch(/^eart_/);
    expect(result.runtime_url).toBe('http://localhost:8000');

    // Verify the agent exists in the store
    const identity = store.get(result.agent_id);
    expect(identity).toBeDefined();
    expect(identity!.agent_name).toBe('Test Bot');
  });

  it('updates config via AgentStore directly', async () => {
    const store = new AgentStore('http://localhost:8000');
    const provisioner = new LocalRuntimeProvisioner(store);

    const result = await provisioner.provision({
      nugget: { goal: 'Test agent' },
      runtime: { agent_name: 'Original Bot' },
    });

    await provisioner.updateConfig(result.agent_id, {
      nugget: { goal: 'Updated agent' },
      runtime: { agent_name: 'Updated Bot' },
    });

    const identity = store.get(result.agent_id);
    expect(identity!.agent_name).toBe('Updated Bot');
  });
});

// ── Content Filter in Turn Pipeline ──────────────────────────────────

describe('Content filter in TurnPipeline', () => {
  it('filters PII from Claude responses', async () => {
    const piiClient = createMockClient('Contact me at test@example.com or call 555-123-4567');
    const store = new AgentStore();
    const convManager = new ConversationManager();
    const pipeline = new TurnPipeline(
      {
        agentStore: store,
        conversationManager: convManager,
        getClient: () => piiClient,
      },
      new UsageTracker(),
    );

    const { agent_id } = store.provision(makeSpec());
    const result = await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

    // PII should be redacted
    expect(result.response).toContain('[email redacted]');
    expect(result.response).toContain('[phone redacted]');
    expect(result.response).not.toContain('test@example.com');
    expect(result.response).not.toContain('555-123-4567');
  });

  it('passes through clean responses unchanged', async () => {
    const cleanClient = createMockClient('Dinosaurs are amazing creatures!');
    const store = new AgentStore();
    const convManager = new ConversationManager();
    const pipeline = new TurnPipeline(
      {
        agentStore: store,
        conversationManager: convManager,
        getClient: () => cleanClient,
      },
      new UsageTracker(),
    );

    const { agent_id } = store.provision(makeSpec());
    const result = await pipeline.receiveTurn(agent_id, { text: 'Tell me about dinosaurs' });

    expect(result.response).toBe('Dinosaurs are amazing creatures!');
  });
});

// ── Usage Limiter in Turn Pipeline ───────────────────────────────────

describe('Usage limiter in TurnPipeline', () => {
  it('blocks turns when daily limit is exhausted', async () => {
    const store = new AgentStore();
    const convManager = new ConversationManager();
    const limiter = new UsageLimiter();
    const pipeline = new TurnPipeline(
      {
        agentStore: store,
        conversationManager: convManager,
        getClient: () => createMockClient(),
      },
      new UsageTracker(),
      limiter,
    );

    const { agent_id } = store.provision(makeSpec());

    // Set a very restrictive tier
    limiter.setTier(agent_id, {
      name: 'free',
      max_turns_per_day: 1,
      max_tokens_per_month: 1_000_000,
    });

    // First turn should succeed
    await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

    // Second turn should be blocked
    await expect(
      pipeline.receiveTurn(agent_id, { text: 'Second message' }),
    ).rejects.toThrow('Daily turn limit reached');
  });
});

// ── Agent Deletion Cascade ───────────────────────────────────────────

describe('Agent deletion cascades to backpack and study mode', () => {
  it('cleans up backpack and study mode on delete', async () => {
    const { agent_id, api_key } = await provisionAgent();

    // Add backpack source
    await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Source', content: 'Content' }),
      headers: { 'x-api-key': api_key },
    });

    // Enable study mode
    await fetchJSON(`/v1/agents/${agent_id}/study`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
      headers: { 'x-api-key': api_key },
    });

    // Verify data exists
    expect(knowledgeBackpack.getSources(agent_id)).toHaveLength(1);
    expect(studyMode.isEnabled(agent_id)).toBe(true);

    // Delete the agent
    await fetchJSON(`/v1/agents/${agent_id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': api_key },
    });

    // Verify cleanup happened
    expect(knowledgeBackpack.getSources(agent_id)).toHaveLength(0);
    expect(studyMode.isEnabled(agent_id)).toBe(false);
  });
});

// ── Knowledge Backpack in Turn Pipeline ──────────────────────────────

describe('Knowledge backpack context injection in TurnPipeline', () => {
  it('injects backpack context into system prompt when sources exist', async () => {
    const { agent_id, api_key } = await provisionAgent();

    // Add a backpack source about dinosaurs
    await fetchJSON(`/v1/agents/${agent_id}/backpack`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Dinosaur Facts',
        content: 'The T-Rex could run at speeds up to 25 miles per hour.',
      }),
      headers: { 'x-api-key': api_key },
    });

    // Make a turn about dinosaurs (should trigger backpack search)
    await fetchJSON(`/v1/agents/${agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'How fast could a T-Rex run?' }),
      headers: { 'x-api-key': api_key },
    });

    // Verify Claude was called with backpack context in the system prompt
    const callArgs = mockClient.messages.create.mock.calls[0][0];
    expect(callArgs.system).toContain('Knowledge Backpack');
    expect(callArgs.system).toContain('T-Rex could run');
  });

  it('does not inject backpack context when no sources match', async () => {
    const { agent_id, api_key } = await provisionAgent();

    // Make a turn with no backpack sources added
    await fetchJSON(`/v1/agents/${agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello!' }),
      headers: { 'x-api-key': api_key },
    });

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    expect(callArgs.system).not.toContain('Knowledge Backpack');
  });
});
