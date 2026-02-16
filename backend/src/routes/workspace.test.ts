import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createWorkspaceRouter } from './workspace.js';

let server: http.Server;
let baseUrl: string;
let tmpDir: string;

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/workspace', createWorkspaceRouter());
  return app;
}

function getPort(srv: http.Server): number {
  const addr = srv.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-ws-test-'));
  const app = createApp();
  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${getPort(server)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/workspace/save', () => {
  it('saves design files to workspace directory', async () => {
    const workDir = path.join(tmpDir, 'my-project');
    const res = await fetch(`${baseUrl}/api/workspace/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_path: workDir,
        workspace_json: { blocks: [] },
        skills: [{ id: 'sk1', name: 'Skill One' }],
        rules: [{ id: 'r1', name: 'Rule One' }],
        portals: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('saved');

    // Verify files were written
    expect(fs.existsSync(path.join(workDir, 'workspace.json'))).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'skills.json'))).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'rules.json'))).toBe(true);
    expect(fs.existsSync(path.join(workDir, 'portals.json'))).toBe(true);

    const ws = JSON.parse(fs.readFileSync(path.join(workDir, 'workspace.json'), 'utf-8'));
    expect(ws).toEqual({ blocks: [] });
  });

  it('returns 400 when workspace_path is missing', async () => {
    const res = await fetch(`${baseUrl}/api/workspace/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_json: {} }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('workspace_path is required');
  });

  it('returns 400 when workspace_path is not a string', async () => {
    const res = await fetch(`${baseUrl}/api/workspace/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: 123 }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('workspace_path is required');
  });

  it('writes default empty values when optional fields are omitted', async () => {
    const workDir = path.join(tmpDir, 'sparse');
    const res = await fetch(`${baseUrl}/api/workspace/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });

    expect(res.status).toBe(200);
    const ws = JSON.parse(fs.readFileSync(path.join(workDir, 'workspace.json'), 'utf-8'));
    expect(ws).toEqual({});
    const skills = JSON.parse(fs.readFileSync(path.join(workDir, 'skills.json'), 'utf-8'));
    expect(skills).toEqual([]);
  });
});

describe('POST /api/workspace/load', () => {
  it('loads design files from workspace directory', async () => {
    // Set up files
    const workDir = path.join(tmpDir, 'load-test');
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'workspace.json'), JSON.stringify({ blocks: [1, 2, 3] }));
    fs.writeFileSync(path.join(workDir, 'skills.json'), JSON.stringify([{ id: 'sk1' }]));
    fs.writeFileSync(path.join(workDir, 'rules.json'), JSON.stringify([{ id: 'r1' }]));
    fs.writeFileSync(path.join(workDir, 'portals.json'), JSON.stringify([{ id: 'p1' }]));

    const res = await fetch(`${baseUrl}/api/workspace/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspace).toEqual({ blocks: [1, 2, 3] });
    expect(body.skills).toEqual([{ id: 'sk1' }]);
    expect(body.rules).toEqual([{ id: 'r1' }]);
    expect(body.portals).toEqual([{ id: 'p1' }]);
  });

  it('returns 400 when workspace_path is missing', async () => {
    const res = await fetch(`${baseUrl}/api/workspace/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toBe('workspace_path is required');
  });

  it('returns 404 for nonexistent directory', async () => {
    const res = await fetch(`${baseUrl}/api/workspace/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: path.join(tmpDir, 'does-not-exist') }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toBe('Directory not found');
  });

  it('returns empty defaults when design files are missing', async () => {
    // Directory exists but has no design files
    const workDir = path.join(tmpDir, 'empty-dir');
    fs.mkdirSync(workDir, { recursive: true });

    const res = await fetch(`${baseUrl}/api/workspace/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspace).toEqual({});
    expect(body.skills).toEqual([]);
    expect(body.rules).toEqual([]);
    expect(body.portals).toEqual([]);
  });

  it('handles malformed JSON files gracefully', async () => {
    const workDir = path.join(tmpDir, 'bad-json');
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'workspace.json'), 'not valid json');

    const res = await fetch(`${baseUrl}/api/workspace/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_path: workDir }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Malformed JSON should fall back to defaults
    expect(body.workspace).toEqual({});
  });
});
