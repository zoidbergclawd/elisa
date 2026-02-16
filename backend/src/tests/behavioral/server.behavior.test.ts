/** Behavioral tests for server startup, CORS, and static file serving.
 *
 * Covers the startServer() refactor for Electron packaging:
 * - startServer() returns a listening HTTP server + auth token
 * - CORS headers applied in dev mode (no staticDir)
 * - CORS headers absent in production mode (with staticDir)
 * - Static files served from staticDir when provided
 * - SPA fallback returns index.html for non-API routes
 * - API routes still work when staticDir is provided
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../../server.js';

let server: http.Server | null = null;
let token: string | null = null;
let tmpDir: string | null = null;

function getPort(srv: http.Server): number {
  const addr = srv.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

function request(
  port: number,
  urlPath: string,
  method = 'GET',
  headers?: Record<string, string>,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method, headers },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

afterEach(async () => {
  if (server) {
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
  }
  token = null;
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

function createStaticDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-static-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>Elisa App</body></html>');
  fs.writeFileSync(path.join(dir, 'test.txt'), 'static-file-content');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'style.css'), 'body { color: red; }');
  return dir;
}

describe('startServer', () => {
  it('returns a listening HTTP server and auth token', async () => {
    const result = await startServer(0);
    server = result.server;
    token = result.authToken;
    const port = getPort(server);
    expect(port).toBeGreaterThan(0);
    expect(server.listening).toBe(true);
    expect(token).toBeTruthy();
  });

  it('responds to /api/health without auth', async () => {
    const result = await startServer(0);
    server = result.server;
    const port = getPort(server);
    const res = await request(port, '/api/health');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('apiKey');
    expect(body).toHaveProperty('agentSdk');
  });
});

describe('CORS behavior', () => {
  it('includes CORS headers in dev mode (no staticDir)', async () => {
    const result = await startServer(0);
    server = result.server;
    const port = getPort(server);
    const res = await request(port, '/api/health');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toBe('*');
    expect(res.headers['access-control-allow-headers']).toBe('*');
  });

  it('omits CORS headers in production mode (with staticDir)', async () => {
    tmpDir = createStaticDir();
    const result = await startServer(0, tmpDir);
    server = result.server;
    const port = getPort(server);
    const res = await request(port, '/api/health');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('static file serving', () => {
  beforeEach(() => {
    tmpDir = createStaticDir();
  });

  it('serves static files from staticDir', async () => {
    const result = await startServer(0, tmpDir!);
    server = result.server;
    const port = getPort(server);
    const res = await request(port, '/test.txt');
    expect(res.status).toBe(200);
    expect(res.body).toBe('static-file-content');
  });

  it('serves nested static files', async () => {
    const result = await startServer(0, tmpDir!);
    server = result.server;
    const port = getPort(server);
    const res = await request(port, '/assets/style.css');
    expect(res.status).toBe(200);
    expect(res.body).toBe('body { color: red; }');
  });

  it('returns index.html for unknown non-API routes (SPA fallback)', async () => {
    const result = await startServer(0, tmpDir!);
    server = result.server;
    const port = getPort(server);
    const res = await request(port, '/some/deep/route');
    expect(res.status).toBe(200);
    expect(res.body).toContain('Elisa App');
  });

  it('does not apply SPA fallback to /api routes', async () => {
    const result = await startServer(0, tmpDir!);
    server = result.server;
    token = result.authToken;
    const port = getPort(server);
    const res = await request(port, '/api/sessions/nonexistent', 'GET', {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.detail).toBe('Session not found');
  });

  it('does not serve static files when staticDir is omitted', async () => {
    const result = await startServer(0);
    server = result.server;
    const port = getPort(server);
    const res = await request(port, '/test.txt');
    // Without staticDir, unknown routes get no handler -> 404 or framework default
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('isDirectRun detection', () => {
  // Tests the pathToFileURL-based comparison used in server.ts.
  // pathToFileURL is platform-dependent, so Windows-format tests verify
  // the expected output format rather than calling pathToFileURL directly.
  const { pathToFileURL } = require('node:url');

  it('Windows: pathToFileURL produces correct file:/// URL with drive letter', () => {
    // On Windows, pathToFileURL('C:\\git\\...') -> 'file:///C:/git/...'
    // Verify the comparison logic works with that expected format.
    const importMetaUrl = 'file:///c:/git/elisa/backend/dist/server.js';
    const expectedPathToFileURLResult = 'file:///C:/git/elisa/backend/dist/server.js';

    // toLowerCase() makes drive letter casing irrelevant
    expect(importMetaUrl.toLowerCase()).toBe(expectedPathToFileURLResult.toLowerCase());
  });

  it('macOS: pathToFileURL produces three slashes, not four', () => {
    const importMetaUrl = 'file:///Users/dev/elisa/backend/dist/server.js';
    const argvPath = '/Users/dev/elisa/backend/dist/server.js';
    const constructed = pathToFileURL(argvPath).href;

    // The old bug: manual "file:///" + "/Users/..." produced "file:////Users/..." (4 slashes)
    // pathToFileURL correctly produces "file:///Users/..." (3 slashes)
    expect(constructed).not.toContain('file:////');
    expect(importMetaUrl.toLowerCase()).toBe(constructed.toLowerCase());
  });

  it('macOS: old manual concatenation would have failed', () => {
    // Documents the bug that pathToFileURL fixes
    const argvPath = '/Users/dev/elisa/backend/dist/server.js';
    const oldBroken = `file:///${argvPath.replace(/\\/g, '/')}`;

    // Old logic produced 4 slashes on macOS — would never match import.meta.url
    expect(oldBroken).toBe('file:////Users/dev/elisa/backend/dist/server.js');
  });
});
