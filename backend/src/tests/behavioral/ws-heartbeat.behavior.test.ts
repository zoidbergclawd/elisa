/** Behavioral tests for WebSocket server-side heartbeat (ping/pong).
 *
 * Uses a minimal server with a fast 100ms interval to verify:
 * - Server sends protocol-level ping frames
 * - Clients that respond with pong stay alive
 * - Clients that miss a pong cycle are terminated
 * - Terminated connections fire the close event
 */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const FAST_INTERVAL_MS = 100;

function createHeartbeatServer() {
  const alive = new WeakMap<WebSocket, boolean>();
  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const connections = new Set<WebSocket>();

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      alive.set(ws, true);
      connections.add(ws);
      ws.on('pong', () => { alive.set(ws, true); });
      ws.on('close', () => { connections.delete(ws); });
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of connections) {
      if (alive.get(ws) === false) { ws.terminate(); continue; }
      alive.set(ws, false);
      ws.ping();
    }
  }, FAST_INTERVAL_MS);

  return { server, wss, connections, heartbeat };
}

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

describe('WebSocket heartbeat', () => {
  let server: http.Server | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  afterEach(async () => {
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it('sends ping frames to connected clients', async () => {
    const ctx = createHeartbeatServer();
    server = ctx.server;
    heartbeat = ctx.heartbeat;
    const port = await listenOnRandomPort(server);

    const ws = await connectWs(port);
    let pingCount = 0;
    ws.on('ping', () => { pingCount++; });

    // Wait for at least 2 heartbeat cycles
    await wait(FAST_INTERVAL_MS * 3);

    expect(pingCount).toBeGreaterThanOrEqual(2);
    ws.close();
  });

  it('keeps alive clients that respond with pong', async () => {
    const ctx = createHeartbeatServer();
    server = ctx.server;
    heartbeat = ctx.heartbeat;
    const port = await listenOnRandomPort(server);

    // ws library auto-responds to pings with pongs by default
    const ws = await connectWs(port);

    // Survive several heartbeat cycles
    await wait(FAST_INTERVAL_MS * 5);

    expect(ws.readyState).toBe(WebSocket.OPEN);
    expect(ctx.connections.size).toBe(1);
    ws.close();
  });

  it('terminates clients that miss a pong cycle', async () => {
    const ctx = createHeartbeatServer();
    server = ctx.server;
    heartbeat = ctx.heartbeat;
    const port = await listenOnRandomPort(server);

    const ws = await connectWs(port);

    // Suppress automatic pong responses so the server thinks we're dead
    ws.pong = () => {};
    ws.on('ping', () => { /* swallow -- don't auto-pong */ });

    const closed = new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });

    // First cycle: sets alive=false and pings.
    // Second cycle: sees alive===false -> terminate.
    await wait(FAST_INTERVAL_MS * 3);

    const code = await closed;
    // ws.terminate() produces code 1006 (abnormal closure)
    expect(code).toBe(1006);
    expect(ctx.connections.size).toBe(0);
  });

  it('fires close event on terminated connections for cleanup', async () => {
    const ctx = createHeartbeatServer();
    server = ctx.server;
    heartbeat = ctx.heartbeat;
    const port = await listenOnRandomPort(server);

    const ws = await connectWs(port);
    expect(ctx.connections.size).toBe(1);

    // Kill auto-pong
    ws.pong = () => {};
    ws.on('ping', () => {});

    const closed = new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
    });

    await wait(FAST_INTERVAL_MS * 3);
    await closed;

    // The close handler should have removed the connection from the set
    expect(ctx.connections.size).toBe(0);
  });
});
