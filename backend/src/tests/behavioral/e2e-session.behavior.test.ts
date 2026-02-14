/** E2E behavioral test: full build session lifecycle.
 *
 * Starts a real HTTP + WebSocket server, creates a session via REST,
 * starts a build, and verifies the expected event sequence arrives
 * over the WebSocket connection.
 *
 * All external services (AgentRunner, MetaPlanner, GitService, etc.)
 * are mocked at module level so no real AI calls or git operations occur.
 */

import { vi, describe, it, expect, afterAll, beforeAll } from 'vitest';

// -- Module mocks (hoisted) --

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn();
  Anthropic.prototype.models = { list: vi.fn().mockResolvedValue({}) };
  Anthropic.prototype.messages = { create: vi.fn().mockResolvedValue({}) };
  return { default: Anthropic };
});

vi.mock('../../services/metaPlanner.js', () => {
  const MetaPlanner = vi.fn();
  MetaPlanner.prototype.plan = vi.fn();
  return { MetaPlanner };
});

vi.mock('../../services/agentRunner.js', () => {
  const AgentRunner = vi.fn();
  AgentRunner.prototype.execute = vi.fn();
  return { AgentRunner };
});

vi.mock('../../services/gitService.js', () => {
  const GitService = vi.fn();
  GitService.prototype.initRepo = vi.fn().mockResolvedValue(undefined);
  GitService.prototype.commit = vi.fn().mockResolvedValue({
    sha: 'e2eabc1234567890',
    shortSha: 'e2eabc1',
    message: 'test commit',
    agentName: 'Builder Bot',
    taskId: 'task-1',
    timestamp: new Date().toISOString(),
    filesChanged: ['index.html'],
  });
  return { GitService };
});

vi.mock('../../services/testRunner.js', () => {
  const TestRunner = vi.fn();
  TestRunner.prototype.runTests = vi.fn().mockResolvedValue({
    tests: [],
    passed: 0,
    failed: 0,
    total: 0,
    coverage_pct: null,
    coverage_details: null,
  });
  return { TestRunner };
});

vi.mock('../../services/teachingEngine.js', () => {
  const TeachingEngine = vi.fn();
  TeachingEngine.prototype.getMoment = vi.fn().mockResolvedValue(null);
  TeachingEngine.prototype.getShownConcepts = vi.fn().mockReturnValue([]);
  return { TeachingEngine };
});

vi.mock('../../services/hardwareService.js', () => {
  const HardwareService = vi.fn();
  HardwareService.prototype.compile = vi.fn().mockResolvedValue({
    success: false,
    errors: ['not configured'],
    outputPath: '',
  });
  HardwareService.prototype.flash = vi.fn().mockResolvedValue({
    success: false,
    message: 'not configured',
  });
  HardwareService.prototype.detectBoard = vi.fn().mockResolvedValue(null);
  HardwareService.prototype.startSerialMonitor = vi.fn().mockResolvedValue({
    close: () => {},
  });
  return { HardwareService };
});

// Mock child_process to prevent DeployPhase from spawning real processes
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  const { EventEmitter } = await import('node:events');
  return {
    ...original,
    execFile: vi.fn(),
    spawn: vi.fn(() => {
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn();
      proc.pid = 99999;
      setTimeout(() => proc.emit('close', 0), 50);
      return proc;
    }),
  };
});

import http from 'node:http';
import { WebSocket } from 'ws';
import { startServer } from '../../server.js';
import { MetaPlanner } from '../../services/metaPlanner.js';
import { AgentRunner } from '../../services/agentRunner.js';

// -- Test state --

const AUTH_TOKEN = 'e2e-test-token';
let server: http.Server;
let port: number;

// -- Setup / Teardown --

beforeAll(async () => {
  // Configure mocks
  vi.mocked(MetaPlanner.prototype.plan).mockResolvedValue({
    tasks: [
      {
        id: 'task-1',
        name: 'Build the app',
        description: 'Create a simple counter app',
        dependencies: [],
        agent_name: 'Builder Bot',
        acceptance_criteria: ['Counter renders'],
      },
    ],
    agents: [
      { name: 'Builder Bot', role: 'builder', persona: 'A friendly bot' },
    ],
    plan_explanation: 'Single task to build the counter.',
  });

  vi.mocked(AgentRunner.prototype.execute).mockResolvedValue({
    success: true,
    summary: 'Built the counter app successfully.',
    inputTokens: 200,
    outputTokens: 100,
    costUsd: 0.02,
  });

  const result = await startServer(0, undefined, AUTH_TOKEN);
  server = result.server;
  const addr = server.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// -- Helpers --

function httpRequest(
  method: string,
  urlPath: string,
  body?: Record<string, any>,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${AUTH_TOKEN}`,
    };
    if (body) headers['Content-Type'] = 'application/json';
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed: any;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode!, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function connectWs(sessionId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${port}/ws/session/${sessionId}?token=${AUTH_TOKEN}`,
    );
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function collectEvents(
  ws: WebSocket,
  until: (events: Record<string, any>[]) => boolean,
  timeoutMs = 15_000,
): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const events: Record<string, any>[] = [];
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      reject(new Error(`Timed out waiting for events. Got: ${events.map(e => e.type).join(', ')}`));
    }, timeoutMs);

    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      events.push(event);
      if (until(events)) {
        clearTimeout(timer);
        ws.removeAllListeners('message');
        resolve(events);
      }
    });
  });
}

// -- Tests --

describe('E2E session lifecycle', () => {
  it('creates a session, starts a build, and receives the expected event sequence', async () => {
    // 1. Create session
    const createRes = await httpRequest('POST', '/api/sessions');
    expect(createRes.status).toBe(200);
    expect(createRes.body).toHaveProperty('session_id');
    const sessionId = createRes.body.session_id;

    // 2. Connect WebSocket
    const ws = await connectWs(sessionId);
    expect(ws.readyState).toBe(WebSocket.OPEN);

    // 3. Start collecting events (will resolve when session_complete arrives)
    const eventPromise = collectEvents(
      ws,
      (events) => events.some((e) => e.type === 'session_complete'),
    );

    // 4. Start build with a minimal spec
    const startRes = await httpRequest('POST', `/api/sessions/${sessionId}/start`, {
      spec: {
        nugget: { goal: 'A simple counter', description: 'Counter app', type: 'general' },
        requirements: [{ type: 'feature', description: 'increment button' }],
        agents: [{ name: 'Builder Bot', role: 'builder', persona: 'Friendly bot' }],
        deployment: { target: 'web', auto_flash: false },
        workflow: {
          review_enabled: false,
          testing_enabled: false,
          human_gates: [],
          flow_hints: [],
          iteration_conditions: [],
        },
      },
    });
    expect(startRes.status).toBe(200);
    expect(startRes.body.status).toBe('started');

    // 5. Wait for events
    const events = await eventPromise;
    const types = events.map((e) => e.type);

    // 6. Verify event sequence
    expect(types).toContain('planning_started');
    expect(types).toContain('plan_ready');
    expect(types).toContain('task_started');
    expect(types).toContain('task_completed');
    expect(types).toContain('session_complete');

    // Verify ordering: planning_started before plan_ready before task_started
    const planningIdx = types.indexOf('planning_started');
    const planReadyIdx = types.indexOf('plan_ready');
    const taskStartIdx = types.indexOf('task_started');
    const taskCompleteIdx = types.indexOf('task_completed');
    const sessionCompleteIdx = types.indexOf('session_complete');

    expect(planningIdx).toBeGreaterThanOrEqual(0);
    expect(planReadyIdx).toBeGreaterThan(planningIdx);
    expect(taskStartIdx).toBeGreaterThan(planReadyIdx);
    expect(taskCompleteIdx).toBeGreaterThan(taskStartIdx);
    expect(sessionCompleteIdx).toBeGreaterThan(taskCompleteIdx);

    // 7. Verify plan_ready payload
    const planReady = events.find((e) => e.type === 'plan_ready');
    expect(planReady?.tasks).toHaveLength(1);
    expect(planReady?.agents).toHaveLength(1);

    // 8. Verify session_complete payload
    const complete = events.find((e) => e.type === 'session_complete');
    expect(complete?.summary).toContain('1/1');

    // Clean up WS
    ws.close();
  });
});
