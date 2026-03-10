import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createSessionRouter } from './sessions.js';
import { SessionStore } from '../services/sessionStore.js';
import type { WSEvent } from '../services/phases/types.js';

let server: http.Server;
let baseUrl: string;
let tmpDir: string;
let store: SessionStore;
let sentEvents: WSEvent[];

function createApp(): express.Express {
  store = new SessionStore(false);
  sentEvents = [];
  const sendEvent = async (_sessionId: string, event: WSEvent) => {
    sentEvents.push(event);
  };
  const app = express();
  app.use(express.json());
  app.use('/api/sessions', createSessionRouter({ store, sendEvent }));
  return app;
}

function getPort(srv: http.Server): number {
  const addr = srv.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-launch-test-'));
  const app = createApp();
  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${getPort(server)}`;
});

afterEach(async () => {
  // Kill any launch processes spawned during tests
  for (const [, entry] of store) {
    if (entry.launchProcess) {
      try { entry.launchProcess.kill(); } catch { /* ignore */ }
    }
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // On Windows, child processes may hold file locks briefly after kill
  await new Promise((r) => setTimeout(r, 200));
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; Windows may still hold locks
  }
});

describe('POST /api/sessions/:id/launch', () => {
  it('returns 404 for unknown session', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/nonexistent/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when no workspace directory is available', async () => {
    // Create a session without an orchestrator
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/sessions/${session_id}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('No workspace directory available');
  });

  it('returns 400 when workspace has no index.html', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    // Create a workspace dir with no index.html
    const workDir = path.join(tmpDir, 'empty-project');
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'main.py'), 'print("hello")');

    const res = await fetch(`${baseUrl}/api/sessions/${session_id}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('No index.html found in workspace');
  });

  it('launches a server and returns url when index.html exists in root', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    // Create a workspace dir with index.html
    const workDir = path.join(tmpDir, 'web-project');
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'index.html'), '<html><body>Hello</body></html>');

    const res = await fetch(`${baseUrl}/api/sessions/${session_id}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^http:\/\/localhost:\d+$/);

    // Verify deploy_complete event was emitted
    const deployEvent = sentEvents.find(e => e.type === 'deploy_complete');
    expect(deployEvent).toBeDefined();
    expect(deployEvent).toHaveProperty('url');
    expect(deployEvent).toHaveProperty('target', 'web');
  }, 15000);

  it('prefers dist/ directory when it has index.html', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    // Create workspace with both root and dist index.html
    const workDir = path.join(tmpDir, 'dist-project');
    fs.mkdirSync(path.join(workDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(workDir, 'index.html'), '<html>root</html>');
    fs.writeFileSync(path.join(workDir, 'dist', 'index.html'), '<html>dist</html>');

    const res = await fetch(`${baseUrl}/api/sessions/${session_id}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^http:\/\/localhost:\d+$/);

    // Verify the server serves the dist content
    const pageRes = await fetch(body.url);
    const pageText = await pageRes.text();
    expect(pageText).toContain('dist');
  }, 15000);

  it('kills previous launch process on re-launch', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, { method: 'POST' });
    const { session_id } = await createRes.json();

    const workDir = path.join(tmpDir, 'relaunch-project');
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'index.html'), '<html>v1</html>');

    // First launch
    const res1 = await fetch(`${baseUrl}/api/sessions/${session_id}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });
    expect(res1.status).toBe(200);
    const { url: url1 } = await res1.json();

    // Second launch should work and return a new (or same) URL
    const res2 = await fetch(`${baseUrl}/api/sessions/${session_id}/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });
    expect(res2.status).toBe(200);
    const { url: url2 } = await res2.json();
    expect(url2).toMatch(/^http:\/\/localhost:\d+$/);

    // The urls may differ (different ports) but both should be valid
    expect(url1).toBeTruthy();
    expect(url2).toBeTruthy();
  }, 20000);
});
