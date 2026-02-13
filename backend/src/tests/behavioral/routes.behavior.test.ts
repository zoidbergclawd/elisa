/** Behavioral tests for route handlers: sessions, hardware, skills.
 *
 * Starts a real HTTP server on port 0 and exercises each endpoint
 * via fetch(). Mocks Orchestrator and MetaPlanner to avoid Claude API calls.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
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

function getPort(srv: http.Server): number {
  const addr = srv.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

function baseUrl(): string {
  return `http://127.0.0.1:${getPort(server!)}`;
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
});

// ---------------------------------------------------------------------------
// Session routes: /api/sessions
// ---------------------------------------------------------------------------

describe('POST /api/sessions', () => {
  it('creates a session and returns session_id', async () => {
    server = await startServer(0);
    const res = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('session_id');
    expect(typeof body.session_id).toBe('string');
    expect(body.session_id.length).toBeGreaterThan(0);
  });
});

describe('GET /api/sessions/:id', () => {
  it('returns session data for an existing session', async () => {
    server = await startServer(0);
    // Create a session first
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(session_id);
    expect(body.state).toBe('idle');
    expect(body.tasks).toEqual([]);
    expect(body.agents).toEqual([]);
  });

  it('returns 404 for a non-existent session', async () => {
    server = await startServer(0);
    const res = await fetch(`${baseUrl()}/api/sessions/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Session not found');
  });
});

describe('POST /api/sessions/:id/start', () => {
  it('rejects an invalid spec with 400', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    // Send a spec with a field that violates the schema (e.g. goal > 2000 chars)
    const invalidSpec = {
      nugget: { goal: 'x'.repeat(2001) },
    };
    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: invalidSpec }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid NuggetSpec');
    expect(body.errors).toBeDefined();
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('accepts a valid spec and returns started', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const validSpec = {
      nugget: { goal: 'Build a weather app', type: 'software' },
    };
    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: validSpec }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('started');
  });

  it('returns 404 for non-existent session', async () => {
    server = await startServer(0);
    const res = await fetch(`${baseUrl()}/api/sessions/nonexistent/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: {} }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects workspace_path that is not a string', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const validSpec = { nugget: { goal: 'Build an app', type: 'software' } };
    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: validSpec, workspace_path: 12345 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/workspace_path/i);
  });

  it('rejects workspace_path exceeding 500 characters', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const validSpec = { nugget: { goal: 'Build an app', type: 'software' } };
    const longPath = 'C:\\' + 'a'.repeat(500);
    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: validSpec, workspace_path: longPath }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toMatch(/workspace_path/i);
  });

  it('accepts a valid spec with workspace_path and returns started', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const os = await import('node:os');
    const path = await import('node:path');
    const tmpDir = path.join(os.tmpdir(), `elisa-ws-session-test-${Date.now()}`);

    const validSpec = { nugget: { goal: 'Build a weather app', type: 'software' } };
    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: validSpec, workspace_path: tmpDir }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('started');

    // Cleanup
    const fs = await import('node:fs');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('POST /api/sessions/:id/stop', () => {
  it('stops a session and returns stopped', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/stop`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('stopped');
  });

  it('returns 404 for a non-existent session', async () => {
    server = await startServer(0);
    const res = await fetch(`${baseUrl()}/api/sessions/nonexistent/stop`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Session not found');
  });
});

describe('GET /api/sessions/:id/tasks', () => {
  it('returns tasks array for an existing session', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/tasks`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([]);
  });

  it('returns 404 for a non-existent session', async () => {
    server = await startServer(0);
    const res = await fetch(`${baseUrl()}/api/sessions/nonexistent/tasks`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Session not found');
  });
});

describe('GET /api/sessions/:id/git', () => {
  it('returns 404 when session has no orchestrator', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    // Session exists but has no orchestrator (not started)
    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/git`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Session not found');
  });
});

describe('GET /api/sessions/:id/tests', () => {
  it('returns 404 when session has no orchestrator', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/tests`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Session not found');
  });
});

describe('POST /api/sessions/:id/gate', () => {
  it('returns 404 when session has no orchestrator', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Session not found');
  });
});

describe('POST /api/sessions/:id/question', () => {
  it('returns 404 when session has no orchestrator', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/sessions/${session_id}/question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: 'task-1', answers: {} }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Session not found');
  });
});

// ---------------------------------------------------------------------------
// Hardware routes: /api/hardware
// ---------------------------------------------------------------------------

describe('POST /api/hardware/detect', () => {
  it('returns detected: false when no hardware connected', async () => {
    server = await startServer(0);
    const res = await fetch(`${baseUrl()}/api/hardware/detect`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detected).toBe(false);
  });
});

describe('POST /api/hardware/flash/:id', () => {
  it('returns 404 when session has no orchestrator', async () => {
    server = await startServer(0);
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/hardware/flash/${session_id}`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Session not found');
  });
});

// ---------------------------------------------------------------------------
// Skill routes: /api/skills
// ---------------------------------------------------------------------------

describe('POST /api/skills/run', () => {
  it('returns 400 when no plan is provided', async () => {
    server = await startServer(0);
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid skill plan');
  });

  it('returns session_id when valid plan is provided', async () => {
    server = await startServer(0);
    const plan = {
      skillName: 'test-skill',
      steps: [{ id: 'step-1', type: 'output', template: 'hello' }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('session_id');
    expect(typeof body.session_id).toBe('string');
  });

  it('returns 400 when plan has invalid step type', async () => {
    server = await startServer(0);
    const plan = {
      skillName: 'test-skill',
      steps: [{ id: 'step-1', type: 'unknown_type' }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('Invalid skill plan');
  });

  it('returns 400 when step prompt exceeds 5000 chars', async () => {
    server = await startServer(0);
    const plan = {
      skillName: 'test-skill',
      steps: [{ id: 'step-1', type: 'run_agent', prompt: 'x'.repeat(5001), storeAs: 'result' }],
    };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when plan has more than 50 steps', async () => {
    server = await startServer(0);
    const steps = Array.from({ length: 51 }, (_, i) => ({
      id: `step-${i}`,
      type: 'output' as const,
      template: 'hello',
    }));
    const plan = { skillName: 'test-skill', steps };
    const res = await fetch(`${baseUrl()}/api/skills/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Workspace routes: /api/workspace
// ---------------------------------------------------------------------------

describe('POST /api/workspace/save', () => {
  let tmpDir: string;

  beforeEach(async () => {
    server = await startServer(0);
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    tmpDir = path.join(os.tmpdir(), `elisa-ws-test-${Date.now()}`);
    // Ensure clean start
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns 400 when workspace_path is missing', async () => {
    const res = await fetch(`${baseUrl()}/api/workspace/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('workspace_path is required');
  });

  it('saves design files to the specified directory', async () => {
    const res = await fetch(`${baseUrl()}/api/workspace/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_path: tmpDir,
        workspace_json: { blocks: [] },
        skills: [{ id: 's1', name: 'test' }],
        rules: [],
        portals: [],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('saved');

    // Verify files were written
    const fs = await import('node:fs');
    const path = await import('node:path');
    expect(fs.existsSync(path.join(tmpDir, 'workspace.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'skills.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'rules.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'portals.json'))).toBe(true);

    const skills = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skills.json'), 'utf-8'));
    expect(skills).toEqual([{ id: 's1', name: 'test' }]);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('POST /api/workspace/load', () => {
  let tmpDir: string;

  beforeEach(async () => {
    server = await startServer(0);
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    tmpDir = path.join(os.tmpdir(), `elisa-ws-load-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'workspace.json'), JSON.stringify({ blocks: [1] }), 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'skills.json'), JSON.stringify([{ id: 's1' }]), 'utf-8');
  });

  it('returns 400 when workspace_path is missing', async () => {
    const res = await fetch(`${baseUrl()}/api/workspace/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('workspace_path is required');
  });

  it('returns 404 for nonexistent directory', async () => {
    const res = await fetch(`${baseUrl()}/api/workspace/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: '/nonexistent/path/that/does/not/exist' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Directory not found');
  });

  it('loads design files from the specified directory', async () => {
    const res = await fetch(`${baseUrl()}/api/workspace/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: tmpDir }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspace).toEqual({ blocks: [1] });
    expect(body.skills).toEqual([{ id: 's1' }]);
    expect(body.rules).toEqual([]);  // file doesn't exist, defaults to []
    expect(body.portals).toEqual([]); // file doesn't exist, defaults to []

    // Cleanup
    const fs = await import('node:fs');
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('POST /api/skills/:sessionId/answer', () => {
  it('returns 404 when no skill runner exists for session', async () => {
    server = await startServer(0);
    // Create a regular session (no skill runner)
    const createRes = await fetch(`${baseUrl()}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl()}/api/skills/${session_id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step_id: 'step-1', answers: {} }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Skill session not found');
  });
});
