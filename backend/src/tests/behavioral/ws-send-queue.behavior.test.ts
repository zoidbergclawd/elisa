/** Behavioral tests for per-session WebSocket send queue.
 *
 * Uses a real WebSocket server (matching ws-heartbeat test pattern) to verify:
 * - FIFO ordering of messages
 * - Concurrent senders serialized through the queue
 * - Event loop yield between frames
 * - Queue depth warnings at thresholds
 * - Drain summary logging for batches > 5
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

// -- Mini ConnectionManager (extracted queue logic) for testing --

interface QueueEntry {
  data: string;
  eventType: string;
  resolve: () => void;
}

class TestConnectionManager {
  connections = new Map<string, Set<WebSocket>>();
  private sendQueues = new Map<string, QueueEntry[]>();
  private draining = new Map<string, boolean>();

  connect(sessionId: string, ws: WebSocket): void {
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(ws);
  }

  async sendEvent(sessionId: string, event: { type: string; [key: string]: unknown }): Promise<void> {
    const conns = this.connections.get(sessionId);
    if (!conns || conns.size === 0) return;

    const data = JSON.stringify(event);

    return new Promise<void>((resolve) => {
      let queue = this.sendQueues.get(sessionId);
      if (!queue) {
        queue = [];
        this.sendQueues.set(sessionId, queue);
      }
      queue.push({ data, eventType: event.type, resolve });

      if (queue.length === 10 || queue.length === 50 || queue.length === 100) {
        console.warn(`[ws-queue] depth=${queue.length} session=${sessionId} latest=${event.type}`);
      }

      if (!this.draining.get(sessionId)) {
        this.drainQueue(sessionId);
      }
    });
  }

  private drainQueue(sessionId: string): void {
    this.draining.set(sessionId, true);
    const startTime = Date.now();
    let count = 0;

    const drainNext = () => {
      const queue = this.sendQueues.get(sessionId);
      if (!queue || queue.length === 0) {
        this.draining.set(sessionId, false);
        if (count > 5) {
          console.log(`[ws-queue] drained session=${sessionId} sent=${count} elapsed=${Date.now() - startTime}ms`);
        }
        return;
      }

      const { data, eventType, resolve } = queue.shift()!;
      const conns = this.connections.get(sessionId);

      if (conns) {
        for (const ws of conns) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data);
            } else if (eventType.startsWith('meeting_')) {
              console.warn(`[ws] dropped ${eventType} for session=${sessionId} (readyState=${ws.readyState})`);
            }
          } catch {
            // ignore send errors
          }
        }
      }

      count++;
      resolve();

      setImmediate(drainNext);
    };

    drainNext();
  }

  cleanup(sessionId: string): void {
    const queue = this.sendQueues.get(sessionId);
    if (queue) {
      for (const entry of queue) entry.resolve();
      this.sendQueues.delete(sessionId);
    }
    this.draining.delete(sessionId);

    const conns = this.connections.get(sessionId);
    if (conns) {
      for (const ws of conns) {
        try { ws.close(); } catch { /* ignore */ }
      }
      this.connections.delete(sessionId);
    }
  }
}

// -- Helpers --

function listenOnRandomPort(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
}

function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function collectMessages(ws: WebSocket): { type: string; seq: number }[] {
  const received: { type: string; seq: number }[] = [];
  ws.on('message', (raw) => {
    received.push(JSON.parse(String(raw)));
  });
  return received;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTestServer() {
  const manager = new TestConnectionManager();
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      manager.connect('test-session', ws);
      ws.on('close', () => {
        manager.connections.get('test-session')?.delete(ws);
      });
    });
  });

  return { server, wss, manager };
}

describe('WebSocket send queue', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it('delivers messages in FIFO order', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);
    const received = collectMessages(ws);

    // Wait for connection to register
    await wait(20);

    // Fire 20 concurrent sendEvent calls (all in the same tick)
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      promises.push(ctx.manager.sendEvent('test-session', { type: 'agent_output', seq: i }));
    }
    await Promise.all(promises);

    // Allow drain to complete
    await wait(100);

    expect(received.length).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(received[i].seq).toBe(i);
    }

    ws.close();
  }, 10_000);

  it('serializes concurrent senders (3 tasks x 10 events)', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);
    const received: { type: string; task: number; seq: number }[] = [];
    ws.on('message', (raw) => { received.push(JSON.parse(String(raw))); });

    await wait(20);

    // 3 "tasks" each fire 10 events concurrently (fire-and-forget)
    for (let task = 0; task < 3; task++) {
      for (let seq = 0; seq < 10; seq++) {
        // Fire-and-forget: no await (matching agentRunner pattern)
        ctx.manager.sendEvent('test-session', { type: 'agent_output', task, seq }).catch(() => {});
      }
    }

    // Wait for all to drain
    await wait(200);

    expect(received.length).toBe(30);

    // All messages should be valid JSON with expected fields
    for (const msg of received) {
      expect(msg.type).toBe('agent_output');
      expect(typeof msg.task).toBe('number');
      expect(typeof msg.seq).toBe('number');
    }

    ws.close();
  }, 10_000);

  it('yields to event loop between frames', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);

    await wait(20);

    // Schedule an I/O callback to check if the event loop runs during drain
    let ioFiredDuringDrain = false;
    let drainComplete = false;

    // Fire 10 events
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(ctx.manager.sendEvent('test-session', { type: 'agent_output', seq: i }));
    }

    // Schedule I/O callback after the first frame is sent
    setImmediate(() => {
      if (!drainComplete) {
        ioFiredDuringDrain = true;
      }
    });

    await Promise.all(promises);
    drainComplete = true;

    expect(ioFiredDuringDrain).toBe(true);

    ws.close();
  }, 10_000);

  it('logs queue depth warnings at thresholds', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);

    await wait(20);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Fire 100 events to hit the 10, 50, and 100 thresholds
    // All in the same tick so they queue up before drain processes them
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(ctx.manager.sendEvent('test-session', { type: 'agent_output', seq: i }));
    }
    await Promise.all(promises);
    await wait(200);

    const queueWarnings = warnSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[ws-queue] depth='),
    );
    expect(queueWarnings.length).toBeGreaterThanOrEqual(1);

    // Check we got the depth=10 warning
    const depth10 = queueWarnings.find((args) => args[0].includes('depth=10'));
    expect(depth10).toBeDefined();

    warnSpy.mockRestore();
    ws.close();
  }, 10_000);

  it('logs drain summary for batches > 5', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);

    await wait(20);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Fire 10 events (> 5 threshold)
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(ctx.manager.sendEvent('test-session', { type: 'agent_output', seq: i }));
    }
    await Promise.all(promises);
    await wait(100);

    const drainLogs = logSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && args[0].includes('[ws-queue] drained'),
    );
    expect(drainLogs.length).toBe(1);
    expect(drainLogs[0][0]).toContain('sent=10');

    logSpy.mockRestore();
    ws.close();
  }, 10_000);
});
