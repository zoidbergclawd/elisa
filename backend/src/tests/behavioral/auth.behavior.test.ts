/** Behavioral tests for authentication middleware (Issue #66).
 *
 * Covers:
 * - REST API requests without Authorization header return 401
 * - REST API requests with wrong token return 401
 * - REST API requests with correct token pass through
 * - OPTIONS requests pass through (CORS preflight)
 * - Health endpoint works without auth
 * - WebSocket upgrade without token is rejected
 * - WebSocket upgrade with wrong token is rejected
 * - WebSocket upgrade with correct token succeeds
 */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocket } from 'ws';
import { startServer } from '../../server.js';

let server: http.Server | null = null;
let authToken: string | null = null;

function getPort(srv: http.Server): number {
  const addr = srv.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

function request(
  port: number,
  urlPath: string,
  method = 'GET',
  headers?: Record<string, string>,
  body?: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const allHeaders: Record<string, string> = { ...headers };
    if (body) allHeaders['Content-Type'] = 'application/json';
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method, headers: allHeaders },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: data }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
  authToken = null;
});

async function startTestServer(): Promise<void> {
  const result = await startServer(0);
  server = result.server;
  authToken = result.authToken;
}

describe('REST API authentication', () => {
  it('returns 401 for requests without Authorization header', async () => {
    await startTestServer();
    const port = getPort(server!);
    const res = await request(port, '/api/sessions', 'POST');
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.detail).toBe('Unauthorized');
  });

  it('returns 401 for requests with wrong token', async () => {
    await startTestServer();
    const port = getPort(server!);
    const res = await request(port, '/api/sessions', 'POST', {
      Authorization: 'Bearer wrong-token',
    });
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.detail).toBe('Unauthorized');
  });

  it('passes through requests with correct token', async () => {
    await startTestServer();
    const port = getPort(server!);
    const res = await request(port, '/api/sessions', 'POST', {
      Authorization: `Bearer ${authToken}`,
    });
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('session_id');
  });

  it('passes through OPTIONS requests without auth (CORS preflight)', async () => {
    await startTestServer();
    const port = getPort(server!);
    const res = await request(port, '/api/sessions', 'OPTIONS');
    // OPTIONS should not get 401
    expect(res.status).not.toBe(401);
  });

  it('health endpoint works without auth', async () => {
    await startTestServer();
    const port = getPort(server!);
    const res = await request(port, '/api/health');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('status');
  });

  it('uses provided auth token when passed to startServer', async () => {
    const customToken = 'my-custom-test-token';
    const result = await startServer(0, undefined, customToken);
    server = result.server;
    authToken = result.authToken;
    expect(authToken).toBe(customToken);

    const port = getPort(server!);
    const res = await request(port, '/api/sessions', 'POST', {
      Authorization: `Bearer ${customToken}`,
    });
    expect(res.status).toBe(200);
  });
});

describe('WebSocket authentication', () => {
  it('rejects WebSocket upgrade without token', async () => {
    await startTestServer();
    const port = getPort(server!);

    // Create a session first (with auth)
    const createRes = await request(port, '/api/sessions', 'POST', {
      Authorization: `Bearer ${authToken}`,
    });
    const { session_id } = JSON.parse(createRes.body);

    // Try to connect without token
    const connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/session/${session_id}`);
      ws.on('open', () => {
        ws.close();
        reject(new Error('Connection should have been rejected'));
      });
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
    });

    await expect(connectPromise).resolves.toBeUndefined();
  });

  it('rejects WebSocket upgrade with wrong token', async () => {
    await startTestServer();
    const port = getPort(server!);

    // Create a session first (with auth)
    const createRes = await request(port, '/api/sessions', 'POST', {
      Authorization: `Bearer ${authToken}`,
    });
    const { session_id } = JSON.parse(createRes.body);

    // Try to connect with wrong token
    const connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/session/${session_id}?token=wrong-token`);
      ws.on('open', () => {
        ws.close();
        reject(new Error('Connection should have been rejected'));
      });
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
    });

    await expect(connectPromise).resolves.toBeUndefined();
  });

  it('accepts WebSocket upgrade with correct token', async () => {
    await startTestServer();
    const port = getPort(server!);

    // Create a session first (with auth)
    const createRes = await request(port, '/api/sessions', 'POST', {
      Authorization: `Bearer ${authToken}`,
    });
    const { session_id } = JSON.parse(createRes.body);

    // Connect with correct token
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/session/${session_id}?token=${authToken}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});
