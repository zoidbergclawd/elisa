/** Tests for POST /api/sessions/:id/fix endpoint. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from 'express';
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

describe('POST /api/sessions/:id/fix', () => {
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
    const res = await fetch(url('/api/sessions/unknown/fix'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bugReport: 'test' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when session is not in done state', async () => {
    const entry = store.create('sess-1', {
      id: 'sess-1',
      state: 'executing',
      spec: null,
      tasks: [],
      agents: [],
    });

    const res = await fetch(url('/api/sessions/sess-1/fix'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bugReport: 'test bug' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain('done state');
  });

  it('returns 400 when bugReport is missing', async () => {
    const entry = store.create('sess-2', {
      id: 'sess-2',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });

    const res = await fetch(url('/api/sessions/sess-2/fix'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('bugReport');
  });

  it('returns 409 when no orchestrator is available', async () => {
    const entry = store.create('sess-3', {
      id: 'sess-3',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });

    const res = await fetch(url('/api/sessions/sess-3/fix'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bugReport: 'some bug' }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.detail).toContain('orchestrator');
  });

  it('returns fix_started and calls orchestrator.runFix', async () => {
    const entry = store.create('sess-4', {
      id: 'sess-4',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });
    const runFix = vi.fn().mockResolvedValue(undefined);
    (entry as any).orchestrator = { runFix };

    const res = await fetch(url('/api/sessions/sess-4/fix'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bugReport: 'Button is broken' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('fix_started');

    // Give async runFix a tick to be called
    await new Promise(r => setTimeout(r, 10));
    expect(runFix).toHaveBeenCalledWith('Button is broken');
  });

  it('resets cleanup timer on fix start', async () => {
    const entry = store.create('sess-cleanup', {
      id: 'sess-cleanup',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });
    const runFix = vi.fn().mockResolvedValue(undefined);
    (entry as any).orchestrator = { runFix };

    await fetch(url('/api/sessions/sess-cleanup/fix'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bugReport: 'timer test' }),
    });
    expect(store.scheduleCleanup).toHaveBeenCalledWith('sess-cleanup');
  });

  it('sends error event when runFix throws', async () => {
    const entry = store.create('sess-5', {
      id: 'sess-5',
      state: 'done',
      spec: null,
      tasks: [],
      agents: [],
    });
    const runFix = vi.fn().mockRejectedValue(new Error('agent crash'));
    (entry as any).orchestrator = { runFix };

    const res = await fetch(url('/api/sessions/sess-5/fix'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bugReport: 'test' }),
    });
    expect(res.status).toBe(200);

    // Wait for async error handler
    await new Promise(r => setTimeout(r, 50));
    expect(sendEvent).toHaveBeenCalledWith('sess-5', expect.objectContaining({
      type: 'error',
      message: expect.stringContaining('agent crash'),
    }));
  });
});

// Need afterEach import
import { afterEach } from 'vitest';
