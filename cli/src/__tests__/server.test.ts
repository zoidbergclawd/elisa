import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { startHeadlessServer, stopServer } from '../server.js';

let serverInfo: { server: http.Server; authToken: string; port: number } | null = null;

afterEach(async () => {
  if (serverInfo) {
    await stopServer(serverInfo.server);
    serverInfo = null;
  }
});

describe('startHeadlessServer', () => {
  it('starts a server on an ephemeral port and returns auth token', async () => {
    serverInfo = await startHeadlessServer();
    expect(serverInfo.port).toBeGreaterThan(0);
    expect(serverInfo.authToken).toBeTruthy();
    expect(serverInfo.server.listening).toBe(true);
  });

  it('responds to /api/health', async () => {
    serverInfo = await startHeadlessServer();
    const res = await fetch(`http://127.0.0.1:${serverInfo.port}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });
});

describe('stopServer', () => {
  it('closes the server', async () => {
    serverInfo = await startHeadlessServer();
    const srv = serverInfo.server;
    await stopServer(srv);
    expect(srv.listening).toBe(false);
    serverInfo = null; // prevent afterEach double-close
  });
});
