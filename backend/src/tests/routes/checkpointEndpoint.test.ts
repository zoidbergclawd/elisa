/** Tests for POST /api/sessions/:id/checkpoint endpoint. */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createSessionRouter } from '../../routes/sessions.js';
import type { SessionStore } from '../../services/sessionStore.js';
import type { WSEvent } from '../../services/phases/types.js';

function createMockStore(): SessionStore {
  const entries = new Map<string, any>();
  return {
    create: vi.fn((id: string, session: any) => {
      const entry = {
        session,
        orchestrator: null,
        skillRunner: null,
        cancelFn: null,
        createdAt: Date.now(),
        userWorkspace: false,
        launchProcess: null,
        staticServer: null,
        iterativeChat: undefined,
      };
      entries.set(id, entry);
      return entry;
    }),
    get: vi.fn((id: string) => entries.get(id)),
    has: vi.fn((id: string) => entries.has(id)),
    scheduleCleanup: vi.fn(),
  } as unknown as SessionStore;
}

function makeApp(store: SessionStore, sendEvent: (id: string, evt: WSEvent) => Promise<void>) {
  const app = express();
  app.use(express.json());
  const router = createSessionRouter({ store, sendEvent });
  app.use('/api/sessions', router);
  return app;
}

async function listen(app: express.Application): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

describe('POST /api/sessions/:id/checkpoint', () => {
  let store: SessionStore;
  let sendEvent: Mock<(id: string, evt: WSEvent) => Promise<void>>;
  let app: express.Application;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    store = createMockStore();
    sendEvent = vi.fn<(id: string, evt: WSEvent) => Promise<void>>().mockResolvedValue(undefined);
    app = makeApp(store, sendEvent);
    const result = await listen(app);
    server = result.server;
    port = result.port;
  });

  afterEach(() => {
    server?.close();
  });

  function url(path: string) {
    return `http://127.0.0.1:${port}${path}`;
  }

  it('returns 404 for unknown session', async () => {
    const res = await fetch(url('/api/sessions/unknown/checkpoint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpoint_id: 'cp-1', response: 'approve' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when checkpoint_id is missing', async () => {
    const entry = store.create('sess-1', {
      id: 'sess-1',
      state: 'executing',
      spec: null,
      tasks: [],
      agents: [],
    });
    (entry as any).orchestrator = { resolveCheckpoint: vi.fn() };

    const res = await fetch(url('/api/sessions/sess-1/checkpoint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'approve' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.detail).toContain('checkpoint_id');
  });

  it('returns 400 for invalid response value', async () => {
    const entry = store.create('sess-2', {
      id: 'sess-2',
      state: 'executing',
      spec: null,
      tasks: [],
      agents: [],
    });
    (entry as any).orchestrator = { resolveCheckpoint: vi.fn() };

    const res = await fetch(url('/api/sessions/sess-2/checkpoint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpoint_id: 'cp-1', response: 'invalid' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.detail).toContain('response');
  });

  it('returns 200 on valid checkpoint response', async () => {
    const resolveCheckpoint = vi.fn();
    const entry = store.create('sess-3', {
      id: 'sess-3',
      state: 'executing',
      spec: null,
      tasks: [],
      agents: [],
    });
    (entry as any).orchestrator = { resolveCheckpoint };

    const res = await fetch(url('/api/sessions/sess-3/checkpoint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpoint_id: 'cp-1', response: 'approve', comment: 'looks good' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(resolveCheckpoint).toHaveBeenCalledWith('cp-1', {
      response: 'approve',
      choice_id: undefined,
      comment: 'looks good',
    });
  });

  it('passes choice_id for choice responses', async () => {
    const resolveCheckpoint = vi.fn();
    const entry = store.create('sess-4', {
      id: 'sess-4',
      state: 'executing',
      spec: null,
      tasks: [],
      agents: [],
    });
    (entry as any).orchestrator = { resolveCheckpoint };

    const res = await fetch(url('/api/sessions/sess-4/checkpoint'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpoint_id: 'cp-2', response: 'choice', choice_id: 'opt-a' }),
    });
    expect(res.status).toBe(200);
    expect(resolveCheckpoint).toHaveBeenCalledWith('cp-2', {
      response: 'choice',
      choice_id: 'opt-a',
      comment: undefined,
    });
  });
});
