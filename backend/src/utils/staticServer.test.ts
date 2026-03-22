import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startStaticServer, type StaticServer } from './staticServer.js';

describe('staticServer', () => {
  let srv: StaticServer | null = null;
  let tmpDir: string;

  afterEach(() => {
    if (srv) { srv.close(); srv = null; }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('serves index.html at root', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-test-'));
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<h1>Hello</h1>');

    srv = await startStaticServer(tmpDir, 0); // port 0 = OS assigns
    const port = Number(new URL(srv.url).port);
    expect(port).toBeGreaterThan(0);

    const res = await fetch(srv.url);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<h1>Hello</h1>');
  });

  it('serves CSS and JS with correct MIME types', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-test-'));
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');
    fs.writeFileSync(path.join(tmpDir, 'style.css'), 'body {}');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'console.log(1)');

    srv = await startStaticServer(tmpDir, 0);
    const css = await fetch(`${srv.url}/style.css`);
    expect(css.headers.get('content-type')).toContain('text/css');
    const js = await fetch(`${srv.url}/app.js`);
    expect(js.headers.get('content-type')).toContain('text/javascript');
  });

  it('returns 404 for missing files', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-test-'));
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');

    srv = await startStaticServer(tmpDir, 0);
    const res = await fetch(`${srv.url}/nope.txt`);
    expect(res.status).toBe(404);
  });

  it('prevents path traversal', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-test-'));
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>');

    srv = await startStaticServer(tmpDir, 0);
    const res = await fetch(`${srv.url}/..%2F..%2Fetc%2Fpasswd`);
    // Should either 403 or 404, not 200
    expect(res.status).toBeGreaterThanOrEqual(403);
  });
});
