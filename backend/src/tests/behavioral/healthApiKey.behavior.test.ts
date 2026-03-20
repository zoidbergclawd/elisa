/** Behavioral tests for API key propagation and health check.
 *
 * Regression tests for the bug where the health endpoint cached API key
 * status at startup and never re-checked, causing the app to report
 * "API key missing" even after the key was set via Electron's settings
 * dialog or environment variable.
 *
 * Verifies:
 * - Health endpoint live-checks process.env.ANTHROPIC_API_KEY (not cached)
 * - Config endpoint allows setting API key in dev mode
 * - Health transitions from 'missing' to 'valid' after key is set
 * - Config endpoint requires auth and is dev-mode only
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
  return { AgentRunner: MockAgentRunner, getClaudeCodePath: () => '/mock/cli.js' };
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

// Mock Anthropic SDK to control health validation
const { mockModelsList } = vi.hoisted(() => ({
  mockModelsList: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    models = { list: mockModelsList };
  },
}));

import { startServer } from '../../server.js';

let server: http.Server | null = null;
let authToken: string | null = null;
let savedApiKey: string | undefined;

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

async function startTestServer(staticDir?: string): Promise<void> {
  const result = await startServer(0, staticDir);
  server = result.server;
  authToken = result.authToken;
}

beforeEach(() => {
  savedApiKey = process.env.ANTHROPIC_API_KEY;
  mockModelsList.mockResolvedValue({ data: [] });
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
  authToken = null;
  // Restore original env
  if (savedApiKey !== undefined) {
    process.env.ANTHROPIC_API_KEY = savedApiKey;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

// ---------------------------------------------------------------------------
// Health endpoint: live API key status
// ---------------------------------------------------------------------------

describe('GET /api/health — API key live-check', () => {
  it('returns missing when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await startTestServer();

    const res = await fetch(`${baseUrl()}/api/health`);
    const body = await res.json();
    expect(body.apiKey).toBe('missing');
    expect(body.status).toBe('degraded');
  });

  it('returns valid when ANTHROPIC_API_KEY is set and API responds', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    await startTestServer();

    // Wait for async startup health validation
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`${baseUrl()}/api/health`);
    const body = await res.json();
    expect(body.apiKey).toBe('valid');
    expect(body.status).toBe('ready');
  });

  it('transitions from missing to valid when API key is set after startup', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await startTestServer();

    // First check: missing
    const res1 = await fetch(`${baseUrl()}/api/health`);
    const body1 = await res1.json();
    expect(body1.apiKey).toBe('missing');

    // Set the env var (simulating config endpoint or manual set)
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    // Second check: should detect the key and re-validate
    const res2 = await fetch(`${baseUrl()}/api/health`);
    const body2 = await res2.json();
    expect(body2.apiKey).toBe('valid');
  });

  it('returns invalid when API key validation fails', async () => {
    mockModelsList.mockRejectedValue(new Error('Invalid API key'));
    process.env.ANTHROPIC_API_KEY = 'sk-bad-key';
    await startTestServer();

    // Wait for async startup validation
    await new Promise(r => setTimeout(r, 100));

    const res = await fetch(`${baseUrl()}/api/health`);
    const body = await res.json();
    expect(body.apiKey).toBe('invalid');
    expect(body.apiKeyError).toBe('API key validation failed');
  });

  it('reverts to missing when API key is removed from env', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    await startTestServer();

    await new Promise(r => setTimeout(r, 100));

    // First: valid
    const res1 = await fetch(`${baseUrl()}/api/health`);
    expect((await res1.json()).apiKey).toBe('valid');

    // Remove the key
    delete process.env.ANTHROPIC_API_KEY;

    // Now: missing
    const res2 = await fetch(`${baseUrl()}/api/health`);
    expect((await res2.json()).apiKey).toBe('missing');
  });
});

// ---------------------------------------------------------------------------
// Config endpoint: POST /api/internal/config
// ---------------------------------------------------------------------------

describe('POST /api/internal/config', () => {
  it('sets API key and returns updated status (dev mode)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await startTestServer(); // no staticDir = dev mode

    // Verify initially missing
    const healthBefore = await fetch(`${baseUrl()}/api/health`);
    expect((await healthBefore.json()).apiKey).toBe('missing');

    // Set key via config endpoint
    const res = await fetch(`${baseUrl()}/api/internal/config`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ apiKey: 'sk-propagated-key' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiKey).toBe('valid');

    // Verify the env var was set
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-propagated-key');

    // Verify health endpoint now returns valid
    const healthAfter = await fetch(`${baseUrl()}/api/health`);
    const healthBody = await healthAfter.json();
    expect(healthBody.apiKey).toBe('valid');
    expect(healthBody.status).toBe('ready');
  });

  it('returns 400 when apiKey is missing from body', async () => {
    await startTestServer();

    const res = await fetch(`${baseUrl()}/api/internal/config`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('apiKey is required');
  });

  it('returns 400 when apiKey is empty string', async () => {
    await startTestServer();

    const res = await fetch(`${baseUrl()}/api/internal/config`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ apiKey: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('requires auth token', async () => {
    await startTestServer();

    const res = await fetch(`${baseUrl()}/api/internal/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-test' }),
    });
    expect(res.status).toBe(401);
  });

  it('is NOT available in production mode (staticDir set)', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const tmpDir = path.join(os.tmpdir(), `elisa-static-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');

    try {
      await startTestServer(tmpDir);

      const res = await fetch(`${baseUrl()}/api/internal/config`, {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ apiKey: 'sk-test' }),
      });
      // Route doesn't exist in production mode — should not return 200
      expect(res.status).not.toBe(200);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('reports invalid when set key fails validation', async () => {
    mockModelsList.mockRejectedValue(new Error('Invalid API key'));
    await startTestServer();

    const res = await fetch(`${baseUrl()}/api/internal/config`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ apiKey: 'sk-bad-key' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiKey).toBe('invalid');
  });

  it('resets the Anthropic client singleton so services pick up the new key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-old-key';
    await startTestServer();

    // Grab the singleton BEFORE the config call
    const { getAnthropicClient } = await import('../../utils/anthropicClient.js');
    const clientBefore = getAnthropicClient();

    // Set a new key via the config endpoint
    const res = await fetch(`${baseUrl()}/api/internal/config`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ apiKey: 'sk-new-key' }),
    });
    expect(res.status).toBe(200);

    // After the config call, the singleton should have been reset,
    // so the next getAnthropicClient() call returns a NEW instance
    const clientAfter = getAnthropicClient();
    expect(clientAfter).not.toBe(clientBefore);
  });
});
