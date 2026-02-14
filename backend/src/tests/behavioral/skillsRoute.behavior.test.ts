/** Behavioral tests for skill route handlers: /api/skills/*
 *
 * Starts a real HTTP server on port 0 and exercises each endpoint
 * via fetch(). Mocks AgentRunner and SkillRunner to avoid Claude API calls.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';

// Mock Orchestrator to avoid real Claude API calls
vi.mock('../../services/orchestrator.js', () => {
  const MockOrchestrator = vi.fn(function (this: any) {
    this.run = vi.fn().mockResolvedValue(undefined);
    this.cancel = vi.fn();
    this.cleanup = vi.fn();
    this.getCommits = vi.fn().mockReturnValue([]);
    this.getTestResults = vi.fn().mockReturnValue({});
    this.respondToGate = vi.fn();
    this.respondToQuestion = vi.fn();
    this.nuggetDir = '/tmp/test-nugget';
  });
  return { Orchestrator: MockOrchestrator };
});

// Mock AgentRunner to avoid real SDK calls
vi.mock('../../services/agentRunner.js', () => {
  const MockAgentRunner = vi.fn(function (this: any) {
    this.execute = vi.fn().mockResolvedValue({
      success: true, summary: 'done', costUsd: 0, inputTokens: 0, outputTokens: 0,
    });
  });
  return { AgentRunner: MockAgentRunner };
});

// Mock SkillRunner to avoid real execution
vi.mock('../../services/skillRunner.js', () => {
  const MockSkillRunner = vi.fn(function (this: any) {
    this.execute = vi.fn().mockResolvedValue('result');
    this.respondToQuestion = vi.fn();
    this.interpretWorkspaceOnBackend = vi.fn().mockReturnValue({});
  });
  return { SkillRunner: MockSkillRunner };
});

import { startServer } from '../../server.js';

let server: http.Server | null = null;
let authToken: string | null = null;

function getPort(srv: http.Server): number {
  const addr = srv.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

function baseUrl(): string {
  return `http://127.0.0.1:${getPort(server!)}`;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...extra,
  };
}

function jsonAuthHeaders(): Record<string, string> {
  return authHeaders({ 'Content-Type': 'application/json' });
}

async function startTestServer(): Promise<void> {
  const result = await startServer(0);
  server = result.server;
  authToken = result.authToken;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
  authToken = null;
});

// ---------------------------------------------------------------------------
// POST /api/skills/run
// ---------------------------------------------------------------------------

describe('POST /api/skills/run - valid plan', () => {
  it('returns session_id when a valid plan is provided', async () => {
    await startTestServer();
    const plan = {
      skillName: 'test-skill',
      steps: [{ id: 'step-1', type: 'output', template: 'hello world' }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('session_id');
    expect(typeof body.session_id).toBe('string');
    expect(body.session_id.length).toBeGreaterThan(0);
  });

  it('accepts plan with allSkills array', async () => {
    await startTestServer();
    const plan = {
      skillName: 'parent-skill',
      steps: [
        { id: 'step-1', type: 'invoke_skill', skillId: 'child-1', storeAs: 'result' },
      ],
    };
    const allSkills = [
      { id: 'child-1', name: 'Child', prompt: 'Do something', category: 'agent' },
    ];
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan, allSkills }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('session_id');
  });
});

describe('POST /api/skills/run - invalid plan (missing fields)', () => {
  it('returns 400 when plan is missing entirely', async () => {
    await startTestServer();
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid skill plan');
    expect(body.errors).toBeDefined();
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('returns 400 when plan has no skillName', async () => {
    await startTestServer();
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan: { steps: [] } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid skill plan');
  });

  it('returns 400 when plan has no steps array', async () => {
    await startTestServer();
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan: { skillName: 'test' } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid skill plan');
  });

  it('returns 400 when step has invalid type', async () => {
    await startTestServer();
    const plan = {
      skillName: 'test',
      steps: [{ id: 'step-1', type: 'nonexistent_type' }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid skill plan');
  });

  it('returns 400 when step is missing required fields for its type', async () => {
    await startTestServer();
    // run_agent requires prompt and storeAs
    const plan = {
      skillName: 'test',
      steps: [{ id: 'step-1', type: 'run_agent' }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid skill plan');
  });
});

describe('POST /api/skills/run - overly long strings', () => {
  it('returns 400 when skillName exceeds 200 chars', async () => {
    await startTestServer();
    const plan = {
      skillName: 'x'.repeat(201),
      steps: [],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid skill plan');
  });

  it('returns 400 when step id exceeds 200 chars', async () => {
    await startTestServer();
    const plan = {
      skillName: 'test',
      steps: [{ id: 'x'.repeat(201), type: 'output', template: 'hello' }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when run_agent prompt exceeds 5000 chars', async () => {
    await startTestServer();
    const plan = {
      skillName: 'test',
      steps: [{
        id: 'step-1',
        type: 'run_agent',
        prompt: 'p'.repeat(5001),
        storeAs: 'result',
      }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when plan has more than 50 steps', async () => {
    await startTestServer();
    const steps = Array.from({ length: 51 }, (_, i) => ({
      id: `step-${i}`,
      type: 'output' as const,
      template: 'hello',
    }));
    const plan = { skillName: 'test', steps };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when output template exceeds 5000 chars', async () => {
    await startTestServer();
    const plan = {
      skillName: 'test',
      steps: [{
        id: 'step-1',
        type: 'output',
        template: 't'.repeat(5001),
      }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/skills/:id/answer
// ---------------------------------------------------------------------------

describe('POST /api/skills/:id/answer - invalid session', () => {
  it('returns 404 when session does not exist', async () => {
    await startTestServer();
    const res = await fetch(`${baseUrl()}/api/skills/nonexistent-session-id/answer`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ step_id: 'step-1', answers: { Color: 'blue' } }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Skill session not found');
  });

  it('returns 404 when session exists but has no skill runner', async () => {
    await startTestServer();
    // Create a regular session (no skill runner attached)
    const createRes = await fetch(`${baseUrl()}/api/sessions`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/skills/${session_id}/answer`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ step_id: 'step-1', answers: {} }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Skill session not found');
  });

  it('returns ok when session has a skill runner', async () => {
    await startTestServer();
    // Create a skill session by running a valid plan
    const plan = {
      skillName: 'test-skill',
      steps: [{ id: 'step-1', type: 'output', template: 'hello' }],
    };
    const runRes = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ plan }),
    });
    const { session_id } = await runRes.json();

    const res = await fetch(`${baseUrl()}/api/skills/${session_id}/answer`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ step_id: 'step-1', answers: { Choice: 'A' } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
