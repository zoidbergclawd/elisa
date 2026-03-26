/** Behavioral tests for session persistence: persistent workspace dirs, checkpointAll, restoreFromProject. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionStore } from '../../services/sessionStore.js';
import type { BuildSession } from '../../models/session.js';

let tmpDir: string;

function makeSession(overrides: Partial<BuildSession> = {}): BuildSession {
  return {
    id: 'test-session-1',
    state: 'done',
    spec: { nugget: { goal: 'Test Project' } } as any,
    tasks: [{ id: 't1', name: 'Task 1', status: 'done', description: 'desc', agent_name: 'builder', dependencies: [], acceptance_criteria: [] }],
    agents: [{ name: 'builder', role: 'builder' as const, persona: 'Builder', status: 'done' as const }],
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-sess-persist-test-'));
  vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('checkpointAll', () => {
  it('checkpoints all sessions in the store', () => {
    const persistDir = path.join(tmpDir, 'persist');
    const store = new SessionStore(persistDir);

    store.create('sess-1', makeSession({ id: 'sess-1' }));
    store.create('sess-2', makeSession({ id: 'sess-2' }));

    store.checkpointAll();

    // Verify files exist
    const files = fs.readdirSync(persistDir).filter(f => f.endsWith('.json'));
    expect(files).toHaveLength(2);
  });

  it('does not crash with empty store', () => {
    const store = new SessionStore(path.join(tmpDir, 'empty'));
    expect(() => store.checkpointAll()).not.toThrow();
  });
});

describe('restoreFromProject', () => {
  it('restores a session from project directory', () => {
    const store = new SessionStore(false);
    const projectDir = path.join(tmpDir, 'my-project');
    const elisaDir = path.join(projectDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });

    fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
      session: {
        id: 'restored-sess',
        state: 'done',
        spec: { nugget: { goal: 'Restored Project' } },
        tasks: [],
        agents: [],
      },
      savedAt: '2026-03-25T10:00:00Z',
    }));

    const entry = store.restoreFromProject(projectDir);
    expect(entry).not.toBeNull();
    expect(entry!.session.id).toBe('restored-sess');
    expect(entry!.session.state).toBe('done');
    expect(entry!.userWorkspace).toBe(true);
    expect(store.has('restored-sess')).toBe(true);
  });

  it('returns null when session.json does not exist', () => {
    const store = new SessionStore(false);
    const projectDir = path.join(tmpDir, 'no-session');
    fs.mkdirSync(projectDir, { recursive: true });

    expect(store.restoreFromProject(projectDir)).toBeNull();
  });

  it('returns null for corrupt session.json', () => {
    const store = new SessionStore(false);
    const projectDir = path.join(tmpDir, 'corrupt');
    const elisaDir = path.join(projectDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), '{invalid json');

    expect(store.restoreFromProject(projectDir)).toBeNull();
  });

  it('returns existing entry if session ID already in store', () => {
    const store = new SessionStore(false);
    store.create('dup-sess', makeSession({ id: 'dup-sess' }));

    const projectDir = path.join(tmpDir, 'dup-project');
    const elisaDir = path.join(projectDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
      session: { id: 'dup-sess', state: 'done', spec: null, tasks: [], agents: [] },
    }));

    const entry = store.restoreFromProject(projectDir);
    expect(entry).not.toBeNull();
    expect(store.size).toBe(1); // No duplicate created
  });

  it('marks non-idle/non-done sessions as done', () => {
    const store = new SessionStore(false);
    const projectDir = path.join(tmpDir, 'mid-build');
    const elisaDir = path.join(projectDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
      session: { id: 'mid-sess', state: 'executing', spec: null, tasks: [], agents: [] },
    }));

    const entry = store.restoreFromProject(projectDir);
    expect(entry!.session.state).toBe('done');
  });

  it('handles flat session.json format (no nested session object)', () => {
    const store = new SessionStore(false);
    const projectDir = path.join(tmpDir, 'flat-format');
    const elisaDir = path.join(projectDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
      sessionId: 'flat-sess',
      state: 'done',
      spec: { nugget: { goal: 'Flat' } },
      tasks: [],
      agents: [],
      savedAt: '2026-03-25T00:00:00Z',
    }));

    const entry = store.restoreFromProject(projectDir);
    expect(entry).not.toBeNull();
    expect(entry!.session.id).toBe('flat-sess');
    expect(entry!.session.state).toBe('done');
  });
});

describe('pruneStale skips project directories', () => {
  it('does not delete workspace for project directories during prune', () => {
    const projectsDir = path.join(tmpDir, 'Elisa', 'projects');
    const projectDir = path.join(projectsDir, 'my-project');
    fs.mkdirSync(projectDir, { recursive: true });

    const store = new SessionStore(false);
    const entry = store.create('old-sess', makeSession({ id: 'old-sess' }));
    // Simulate old session
    entry.createdAt = Date.now() - 7_200_000; // 2 hours ago
    // Create a mock orchestrator with nuggetDir pointing to project dir
    entry.orchestrator = { nuggetDir: projectDir, cleanup: vi.fn() } as any;

    const pruned = store.pruneStale(3_600_000);
    expect(pruned).toContain('old-sess');
    // cleanup() should NOT have been called because it's a project dir
    expect(entry.orchestrator!.cleanup).not.toHaveBeenCalled();
  });
});
