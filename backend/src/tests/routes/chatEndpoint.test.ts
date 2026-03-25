/** Tests for POST /api/sessions/:id/chat endpoint. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

describe('POST /api/sessions/:id/chat', () => {
  let store: SessionStore;
  let sendEvent: ReturnType<typeof vi.fn>;
  let app: express.Application;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    store = createMockStore();
    sendEvent = vi.fn().mockResolvedValue(undefined);
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
    const res = await fetch(url('/api/sessions/unknown/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when session is not in done state', async () => {
    store.create('sess-1', {
      id: 'sess-1',
      state: 'executing',
      spec: null,
      tasks: [],
      agents: [],
    });

    const res = await fetch(url('/api/sessions/sess-1/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'fix the bug' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain('done state');
  });

  it('returns 409 when no orchestrator is available', async () => {
    store.create('sess-2', {
      id: 'sess-2',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });

    const res = await fetch(url('/api/sessions/sess-2/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'fix the bug' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain('orchestrator');
  });

  it('returns 400 when message is missing', async () => {
    const entry = store.create('sess-3', {
      id: 'sess-3',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });
    (entry as any).orchestrator = { nuggetDir: '/tmp/test' };

    const res = await fetch(url('/api/sessions/sess-3/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('message');
  });

  it('returns 200 with status processing when valid', async () => {
    const entry = store.create('sess-4', {
      id: 'sess-4',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });
    (entry as any).orchestrator = { nuggetDir: '/tmp/test' };

    const res = await fetch(url('/api/sessions/sess-4/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Make the button red' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('processing');
  });

  it('returns 409 when chat is already processing', async () => {
    const entry = store.create('sess-5', {
      id: 'sess-5',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });
    (entry as any).orchestrator = { nuggetDir: '/tmp/test' };
    (entry as any).iterativeChat = {
      sessionId: 'sess-5',
      turns: [],
      isProcessing: true,
      totalTokens: 0,
    };

    const res = await fetch(url('/api/sessions/sess-5/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Fix the bug' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain('already processing');
  });

  it('resets cleanup timer on chat request', async () => {
    const entry = store.create('sess-6', {
      id: 'sess-6',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });
    (entry as any).orchestrator = { nuggetDir: '/tmp/test' };

    await fetch(url('/api/sessions/sess-6/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(store.scheduleCleanup).toHaveBeenCalledWith('sess-6');
  });
});
