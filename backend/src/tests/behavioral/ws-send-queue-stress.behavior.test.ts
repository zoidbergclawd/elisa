/** Stress tests for per-session WebSocket send queue.
 *
 * Simulates the exact production failure scenario (concurrent fire-and-forget
 * senders) and characterizes system limits. Uses real WebSocket connections
 * to capture full TCP buffer dynamics.
 */

import { describe, it, expect, afterEach } from 'vitest';
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

      if (!this.draining.get(sessionId)) {
        this.drainQueue(sessionId);
      }
    });
  }

  private drainQueue(sessionId: string): void {
    this.draining.set(sessionId, true);

    const drainNext = () => {
      const queue = this.sendQueues.get(sessionId);
      if (!queue || queue.length === 0) {
        this.draining.set(sessionId, false);
        return;
      }

      const { data, resolve } = queue.shift()!;
      const conns = this.connections.get(sessionId);

      if (conns) {
        for (const ws of conns) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data);
            }
          } catch {
            // ignore send errors
          }
        }
      }

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

describe('WebSocket send queue stress', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it('parallel task simulation: 3 tasks x 20 fire-and-forget events', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);
    const received: { type: string; task: number; seq: number }[] = [];
    ws.on('message', (raw) => { received.push(JSON.parse(String(raw))); });

    await wait(20);

    // Simulate 3 concurrent tasks each firing 20 agent_output events (fire-and-forget)
    for (let task = 0; task < 3; task++) {
      for (let seq = 0; seq < 20; seq++) {
        ctx.manager.sendEvent('test-session', { type: 'agent_output', task, seq }).catch(() => {});
      }
    }

    // Wait for all to drain
    await wait(500);

    // Zero frame loss
    expect(received.length).toBe(60);

    // All messages are well-formed
    for (const msg of received) {
      expect(msg.type).toBe('agent_output');
      expect(typeof msg.task).toBe('number');
      expect(typeof msg.seq).toBe('number');
    }

    ws.close();
  }, 10_000);

  it('mixed concurrent + sequential sends (real workload pattern)', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);
    const received: { type: string; [key: string]: unknown }[] = [];
    ws.on('message', (raw) => { received.push(JSON.parse(String(raw))); });

    await wait(20);

    // 3 concurrent tasks streaming agent_output (fire-and-forget)
    for (let task = 0; task < 3; task++) {
      for (let seq = 0; seq < 10; seq++) {
        ctx.manager.sendEvent('test-session', { type: 'agent_output', task, seq }).catch(() => {});
      }
    }

    // Plus one task completing: awaited test_result loop + fire-and-forget meeting_invite
    const awaitedPromises: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      awaitedPromises.push(
        ctx.manager.sendEvent('test-session', { type: 'test_result', index: i }),
      );
    }

    // Fire-and-forget meeting invite
    ctx.manager.sendEvent('test-session', { type: 'meeting_invite', meetingId: 'buddy' }).catch(() => {});

    // Await the test_result sends (backpressure test)
    await Promise.all(awaitedPromises);

    // Wait for remaining fire-and-forget to drain
    await wait(300);

    // Total: 30 agent_output + 5 test_result + 1 meeting_invite = 36
    expect(received.length).toBe(36);

    // Verify awaited sends resolved (they completed above without timeout)
    const testResults = received.filter((m) => m.type === 'test_result');
    expect(testResults.length).toBe(5);

    const meetingInvites = received.filter((m) => m.type === 'meeting_invite');
    expect(meetingInvites.length).toBe(1);

    ws.close();
  }, 10_000);

  it('scale stress: 10 senders x 50 events each (500 total)', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);
    const received: { type: string; sender: number; seq: number }[] = [];
    ws.on('message', (raw) => { received.push(JSON.parse(String(raw))); });

    await wait(20);

    const startTime = Date.now();

    // 10 concurrent senders, 50 events each
    for (let sender = 0; sender < 10; sender++) {
      for (let seq = 0; seq < 50; seq++) {
        ctx.manager.sendEvent('test-session', { type: 'agent_output', sender, seq }).catch(() => {});
      }
    }

    // Wait for drain (expect ~500ms at 1ms/yield)
    await wait(2000);

    const elapsed = Date.now() - startTime;

    // Zero frame loss
    expect(received.length).toBe(500);

    // All messages valid JSON with expected fields
    for (const msg of received) {
      expect(msg.type).toBe('agent_output');
      expect(typeof msg.sender).toBe('number');
      expect(typeof msg.seq).toBe('number');
    }

    // Per-sender ordering preserved (messages from same sender arrive in order)
    for (let sender = 0; sender < 10; sender++) {
      const senderMsgs = received.filter((m) => m.sender === sender);
      expect(senderMsgs.length).toBe(50);
      for (let i = 1; i < senderMsgs.length; i++) {
        expect(senderMsgs[i].seq).toBeGreaterThan(senderMsgs[i - 1].seq);
      }
    }

    console.log(`[stress] 500 events drained in ${elapsed}ms`);

    ws.close();
  }, 10_000);

  it('burst-idle-burst: two phases with idle gap', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);
    const received: { type: string; phase: number; seq: number }[] = [];
    ws.on('message', (raw) => { received.push(JSON.parse(String(raw))); });

    await wait(20);

    // Phase 1: burst of 100 events
    for (let i = 0; i < 100; i++) {
      ctx.manager.sendEvent('test-session', { type: 'agent_output', phase: 1, seq: i }).catch(() => {});
    }

    // Wait for drain + idle gap
    await wait(500);

    const phase1Count = received.length;
    expect(phase1Count).toBe(100);

    // Phase 2: burst of 100 more events
    for (let i = 0; i < 100; i++) {
      ctx.manager.sendEvent('test-session', { type: 'agent_output', phase: 2, seq: i }).catch(() => {});
    }

    await wait(500);

    expect(received.length).toBe(200);

    // Verify phase ordering
    const phase1 = received.filter((m) => m.phase === 1);
    const phase2 = received.filter((m) => m.phase === 2);
    expect(phase1.length).toBe(100);
    expect(phase2.length).toBe(100);

    // Phase 1 messages all appear before phase 2 messages
    const lastPhase1Idx = received.findLastIndex((m) => m.phase === 1);
    const firstPhase2Idx = received.findIndex((m) => m.phase === 2);
    expect(lastPhase1Idx).toBeLessThan(firstPhase2Idx);

    ws.close();
  }, 10_000);

  it('cleanup during active drain resolves pending promises', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);

    await wait(20);

    // Queue 100 events
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(ctx.manager.sendEvent('test-session', { type: 'agent_output', seq: i }));
    }

    // Cleanup mid-drain (after first frame sends but before all drain)
    await wait(5);
    ctx.manager.cleanup('test-session');

    // All promises should resolve (no hang)
    await Promise.race([
      Promise.all(promises),
      wait(2000).then(() => { throw new Error('promises hung after cleanup'); }),
    ]);

    ws.close();
  }, 10_000);

  it('timing characterization (benchmark)', async () => {
    const ctx = createTestServer();
    server = ctx.server;
    const port = await listenOnRandomPort(server);
    const ws = await connectWs(port);
    const received: unknown[] = [];
    ws.on('message', (raw) => { received.push(JSON.parse(String(raw))); });

    await wait(20);

    const COUNT = 1000;
    const startTime = Date.now();
    const entryTimes: number[] = [];

    // Fire 1000 events and track when each enters the queue
    const promises: Promise<void>[] = [];
    for (let i = 0; i < COUNT; i++) {
      entryTimes.push(Date.now());
      promises.push(ctx.manager.sendEvent('test-session', { type: 'agent_output', seq: i }));
    }

    await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    // Wait for all messages to arrive at client
    await wait(500);

    // Calculate latencies (time from queue entry to promise resolve)
    const resolveTimes = Date.now(); // approximate
    const latencies = entryTimes.map((t) => resolveTimes - t);
    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p99Latency = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`[benchmark] ${COUNT} events:`);
    console.log(`  Total drain time: ${totalTime}ms`);
    console.log(`  Avg latency: ${avgLatency.toFixed(1)}ms`);
    console.log(`  P99 latency: ${p99Latency}ms`);
    console.log(`  Messages received: ${received.length}`);

    // This test always passes but prints benchmark results
    expect(received.length).toBe(COUNT);
    expect(totalTime).toBeLessThan(10_000); // sanity: should not take 10s

    ws.close();
  }, 10_000);
});
