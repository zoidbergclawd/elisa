import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { listenForEvents } from '../wsListener.js';

let wss: WebSocketServer | null = null;

afterEach(() => {
  if (wss) {
    wss.close();
    wss = null;
  }
});

function startMockWs(port: number, events: Record<string, unknown>[]): WebSocketServer {
  wss = new WebSocketServer({ port });
  wss.on('connection', (ws) => {
    for (const event of events) {
      ws.send(JSON.stringify(event));
    }
  });
  return wss;
}

describe('listenForEvents', () => {
  it('receives events and calls handler for each', async () => {
    const port = 19876;
    startMockWs(port, [
      { type: 'planning_started' },
      { type: 'task_started', task_id: '1' },
      { type: 'session_complete', summary: 'Done' },
    ]);

    const handler = vi.fn();
    await listenForEvents(`ws://127.0.0.1:${port}`, handler);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'planning_started' }));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'session_complete' }));
  });

  it('resolves when session_complete is received', async () => {
    const port = 19877;
    startMockWs(port, [{ type: 'session_complete', summary: 'Done' }]);

    const handler = vi.fn();
    await listenForEvents(`ws://127.0.0.1:${port}`, handler);
    // If we reach here, the promise resolved correctly
    expect(true).toBe(true);
  });

  it('resolves when fatal error is received', async () => {
    const port = 19878;
    startMockWs(port, [{ type: 'error', message: 'Fatal', recoverable: false }]);

    const handler = vi.fn();
    await listenForEvents(`ws://127.0.0.1:${port}`, handler);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
