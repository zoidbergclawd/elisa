import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import http from 'node:http';
import { startHeadlessServer, stopServer } from '../server.js';
import { SessionClient } from '../session.js';

let server: http.Server;
let port: number;
let token: string;

beforeAll(async () => {
  const info = await startHeadlessServer();
  server = info.server;
  port = info.port;
  token = info.authToken;
});

afterAll(async () => {
  await stopServer(server);
});

describe('SessionClient', { timeout: 30000 }, () => {
  it('creates a session and returns a session ID', async () => {
    const client = new SessionClient(port, token);
    const sessionId = await client.create();
    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe('string');
  });

  it('starts a session with a minimal NuggetSpec', async () => {
    const client = new SessionClient(port, token);
    const sessionId = await client.create();
    const result = await client.start(sessionId, {
      nugget: { goal: 'test', description: 'test', type: 'web' },
      requirements: [],
      agents: [],
      deployment: { target: 'web' },
      workflow: { review_enabled: false, testing_enabled: false, human_gates: [] },
    });
    expect(result.status).toBe('started');
  });

  it('stops a session', async () => {
    const client = new SessionClient(port, token);
    const sessionId = await client.create();
    await client.start(sessionId, {
      nugget: { goal: 'test', description: 'test', type: 'web' },
      requirements: [],
      agents: [],
      deployment: { target: 'web' },
      workflow: { review_enabled: false, testing_enabled: false, human_gates: [] },
    });
    const result = await client.stop(sessionId);
    expect(result.status).toBe('stopped');
  });

  it('gets session status', async () => {
    const client = new SessionClient(port, token);
    const sessionId = await client.create();
    const session = await client.getStatus(sessionId);
    expect(session).toHaveProperty('id', sessionId);
    expect(session).toHaveProperty('state');
  });
});
