/** Tests for runtime REST routes: all endpoints, auth validation. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import { AgentStore } from '../../services/runtime/agentStore.js';
import { ConversationManager } from '../../services/runtime/conversationManager.js';
import { TurnPipeline, UsageTracker } from '../../services/runtime/turnPipeline.js';
import { createRuntimeRouter } from '../../routes/runtime.js';

// ── Mock Anthropic Client ────────────────────────────────────────────

function createMockClient() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock response' }],
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
let mockClient: any;

function createTestApp() {
  agentStore = new AgentStore('http://localhost:8000');
  conversationManager = new ConversationManager();
  mockClient = createMockClient();

  turnPipeline = new TurnPipeline(
    {
      agentStore,
      conversationManager,
      getClient: () => mockClient,
    },
    new UsageTracker(),
  );

  const app = express();
  app.use(express.json());
  app.use('/v1', createRuntimeRouter({ agentStore, conversationManager, turnPipeline }));
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

// ── POST /v1/agents (Provision) ──────────────────────────────────────

describe('POST /v1/agents', () => {
  it('provisions a new agent and returns credentials', async () => {
    const { status, body } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    expect(status).toBe(201);
    expect(body).toHaveProperty('agent_id');
    expect(body).toHaveProperty('api_key');
    expect(body).toHaveProperty('runtime_url');
    expect(body.api_key).toMatch(/^eart_/);
  });

  it('returns 400 for non-object body', async () => {
    // Send an array (not a plain object)
    const { status, body } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify([1, 2, 3]),
    });

    expect(status).toBe(400);
    expect(body).toBeTruthy();
    expect(body.detail).toContain('NuggetSpec');
  });

  it('does not require api key auth', async () => {
    // No x-api-key header — should still work
    const { status } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    expect(status).toBe(201);
  });
});

// ── PUT /v1/agents/:id (Update) ─────────────────────────────────────

describe('PUT /v1/agents/:id', () => {
  it('updates agent config with valid api key', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const updatedSpec = makeSpec();
    updatedSpec.runtime.agent_name = 'Rex Bot';

    const { status, body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}`, {
      method: 'PUT',
      body: JSON.stringify(updatedSpec),
      headers: { 'x-api-key': provisioned.api_key },
    });

    expect(status).toBe(200);
    expect(body.status).toBe('updated');
  });

  it('returns 401 without api key', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status, body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}`, {
      method: 'PUT',
      body: JSON.stringify(makeSpec()),
    });

    expect(status).toBe(401);
    expect(body.detail).toContain('x-api-key');
  });

  it('returns 403 with wrong api key', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status, body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}`, {
      method: 'PUT',
      body: JSON.stringify(makeSpec()),
      headers: { 'x-api-key': 'wrong_key' },
    });

    expect(status).toBe(403);
    expect(body.detail).toContain('Invalid');
  });
});

// ── DELETE /v1/agents/:id (Deprovision) ──────────────────────────────

describe('DELETE /v1/agents/:id', () => {
  it('deletes agent with valid api key', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status, body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': provisioned.api_key },
    });

    expect(status).toBe(200);
    expect(body.status).toBe('deleted');
  });

  it('returns 401 without api key', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status } = await fetchJSON(`/v1/agents/${provisioned.agent_id}`, {
      method: 'DELETE',
    });

    expect(status).toBe(401);
  });

  it('cleans up conversation sessions and usage records', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    // Create a conversation
    await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello!' }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    // Delete the agent
    await fetchJSON(`/v1/agents/${provisioned.agent_id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': provisioned.api_key },
    });

    // Verify heartbeat now returns 404
    const { status } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/heartbeat`);
    expect(status).toBe(404);
  });
});

// ── POST /v1/agents/:id/turn/text (Conversation Turn) ───────────────

describe('POST /v1/agents/:id/turn/text', () => {
  it('processes a text turn and returns response', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status, body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'What is a T-Rex?' }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    expect(status).toBe(200);
    expect(body.response).toBe('Mock response');
    expect(body.session_id).toBeDefined();
    expect(body.input_tokens).toBe(100);
    expect(body.output_tokens).toBe(50);
  });

  it('creates a new session when session_id not provided', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello!' }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    expect(body.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('reuses session when session_id is provided', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    // First turn — creates session
    const { body: first } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello!' }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    // Second turn — reuses session
    const { body: second } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Tell me more!', session_id: first.session_id }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    expect(second.session_id).toBe(first.session_id);
  });

  it('returns 400 when text field is missing', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status, body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'x-api-key': provisioned.api_key },
    });

    expect(status).toBe(400);
    expect(body.detail).toContain('text');
  });

  it('returns 401 without api key', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello!' }),
    });

    expect(status).toBe(401);
  });
});

// ── GET /v1/agents/:id/history (Conversation History) ────────────────

describe('GET /v1/agents/:id/history', () => {
  it('lists all sessions for an agent', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    // Create two conversations
    await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello!' }),
      headers: { 'x-api-key': provisioned.api_key },
    });
    await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hi again!' }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    const { status, body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/history`, {
      headers: { 'x-api-key': provisioned.api_key },
    });

    expect(status).toBe(200);
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0]).toHaveProperty('session_id');
    expect(body.sessions[0]).toHaveProperty('turn_count');
  });

  it('returns history for a specific session', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { body: turnResult } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'What is a T-Rex?' }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    const { status, body } = await fetchJSON(
      `/v1/agents/${provisioned.agent_id}/history?session_id=${turnResult.session_id}`,
      { headers: { 'x-api-key': provisioned.api_key } },
    );

    expect(status).toBe(200);
    expect(body.turns).toHaveLength(2);
    expect(body.turns[0].role).toBe('user');
    expect(body.turns[0].content).toBe('What is a T-Rex?');
    expect(body.turns[1].role).toBe('assistant');
  });

  it('supports limit parameter', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    // Create a conversation with multiple turns
    const { body: r1 } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Turn 1' }),
      headers: { 'x-api-key': provisioned.api_key },
    });
    await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Turn 2', session_id: r1.session_id }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    const { body } = await fetchJSON(
      `/v1/agents/${provisioned.agent_id}/history?session_id=${r1.session_id}&limit=2`,
      { headers: { 'x-api-key': provisioned.api_key } },
    );

    expect(body.turns).toHaveLength(2);
  });

  it('returns 401 without api key', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/history`);
    expect(status).toBe(401);
  });
});

// ── GET /v1/agents/:id/heartbeat (Health Check) ─────────────────────

describe('GET /v1/agents/:id/heartbeat', () => {
  it('returns online status for existing agent', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    const { status, body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/heartbeat`);

    expect(status).toBe(200);
    expect(body.status).toBe('online');
    expect(body.agent_id).toBe(provisioned.agent_id);
    expect(body.agent_name).toBe('Dino Bot');
    expect(body.session_count).toBe(0);
  });

  it('returns usage totals', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    // Create a conversation to generate usage
    await fetchJSON(`/v1/agents/${provisioned.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello!' }),
      headers: { 'x-api-key': provisioned.api_key },
    });

    const { body } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/heartbeat`);

    expect(body.total_input_tokens).toBe(100);
    expect(body.total_output_tokens).toBe(50);
    expect(body.session_count).toBe(1);
  });

  it('returns 404 for non-existent agent', async () => {
    const { status, body } = await fetchJSON('/v1/agents/nonexistent/heartbeat');

    expect(status).toBe(404);
    expect(body.status).toBe('not_found');
  });

  it('does not require api key auth (public health check)', async () => {
    const { body: provisioned } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    // No x-api-key header — heartbeat should still work
    const { status } = await fetchJSON(`/v1/agents/${provisioned.agent_id}/heartbeat`);
    expect(status).toBe(200);
  });
});

// ── Auth validation across endpoints ─────────────────────────────────

describe('API key auth validation', () => {
  it('returns 403 when using api key from a different agent', async () => {
    const { body: agent1 } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });
    const { body: agent2 } = await fetchJSON('/v1/agents', {
      method: 'POST',
      body: JSON.stringify(makeSpec()),
    });

    // Try to use agent1's key to access agent2's endpoint
    const { status } = await fetchJSON(`/v1/agents/${agent2.agent_id}/turn/text`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello!' }),
      headers: { 'x-api-key': agent1.api_key },
    });

    expect(status).toBe(403);
  });
});
