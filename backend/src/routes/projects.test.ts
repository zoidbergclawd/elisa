/** Tests for projects routes. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createProjectRouter } from './projects.js';
import { SessionStore } from '../services/sessionStore.js';

let server: http.Server;
let baseUrl: string;
let tmpDir: string;
let store: SessionStore;

function getPort(srv: http.Server): number {
  const addr = srv.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-proj-route-test-'));
  // Mock os.homedir so listProjects scans our temp dir
  vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);

  store = new SessionStore(false);
  const app = express();
  app.use(express.json());
  app.use('/api/projects', createProjectRouter({ store }));
  app.use('/api', createProjectRouter({ store }));

  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${getPort(server)}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/projects', () => {
  it('returns empty array when no projects exist', async () => {
    const res = await fetch(`${baseUrl}/api/projects`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns projects with valid session.json', async () => {
    const projectsDir = path.join(tmpDir, 'Elisa', 'projects');
    const elisaDir = path.join(projectsDir, 'my-game', '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
      sessionId: 'sess-1',
      state: 'done',
      savedAt: '2026-03-25T10:00:00Z',
      spec: { nugget: { goal: 'My Game' } },
    }));

    const res = await fetch(`${baseUrl}/api/projects`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].slug).toBe('my-game');
    expect(body[0].goal).toBe('My Game');
  });
});

describe('POST /api/sessions/:id/restore', () => {
  it('restores a session from project directory', async () => {
    const projDir = path.join(tmpDir, 'Elisa', 'projects', 'test-project');
    const elisaDir = path.join(projDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
      session: {
        id: 'old-id',
        state: 'done',
        spec: { nugget: { goal: 'Test' } },
        tasks: [{ id: 't1', name: 'Task 1', status: 'done' }],
        agents: [{ name: 'builder', role: 'builder', status: 'done' }],
      },
      savedAt: '2026-03-25T00:00:00Z',
      testResults: { passed: 3, total: 4 },
      testGatePassed: true,
    }));

    const res = await fetch(`${baseUrl}/api/sessions/new-session-id/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir: projDir }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_id).toBe('new-session-id');
    expect(body.session.state).toBe('done');
    expect(body.session.testResults.passed).toBe(3);

    // Session should exist in the store
    const entry = store.get('new-session-id');
    expect(entry).toBeDefined();
    expect(entry!.userWorkspace).toBe(true);
  });

  it('returns 400 when projectDir is missing', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/test/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('projectDir is required');
  });

  it('returns 403 for path outside projects root', async () => {
    const projDir = path.join(tmpDir, 'outside-project');
    fs.mkdirSync(projDir, { recursive: true });

    const res = await fetch(`${baseUrl}/api/sessions/test/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir: projDir }),
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 when session.json is missing', async () => {
    const projDir = path.join(tmpDir, 'Elisa', 'projects', 'empty-project');
    fs.mkdirSync(projDir, { recursive: true });

    const res = await fetch(`${baseUrl}/api/sessions/test/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir: projDir }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 422 for invalid JSON', async () => {
    const projDir = path.join(tmpDir, 'Elisa', 'projects', 'bad-project');
    const elisaDir = path.join(projDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), '{broken json');

    const res = await fetch(`${baseUrl}/api/sessions/test/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectDir: projDir }),
    });

    expect(res.status).toBe(422);
  });
});
