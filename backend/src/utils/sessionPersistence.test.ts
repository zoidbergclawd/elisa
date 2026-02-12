/** Tests for SessionPersistence. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionPersistence } from './sessionPersistence.js';
import type { BuildSession } from '../models/session.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-persist-test-'));
}

function makeSession(overrides: Partial<BuildSession> = {}): BuildSession {
  return {
    id: 'test-session-1',
    state: 'executing',
    spec: { goal: 'test' },
    tasks: [{ id: 't1', name: 'Task 1', status: 'done' }],
    agents: [{ name: 'builder', role: 'builder', status: 'idle' }],
    ...overrides,
  };
}

describe('SessionPersistence', () => {
  let dir: string;
  let persistence: SessionPersistence;

  beforeEach(() => {
    dir = makeTempDir();
    persistence = new SessionPersistence(dir);
  });

  afterEach(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('checkpoints and loads a session', () => {
    const session = makeSession();
    persistence.checkpoint(session);

    const loaded = persistence.load('test-session-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.session.id).toBe('test-session-1');
    expect(loaded!.session.state).toBe('executing');
    expect(loaded!.phase).toBe('executing');
    expect(loaded!.savedAt).toBeTruthy();
  });

  it('returns null for non-existent session', () => {
    expect(persistence.load('nonexistent')).toBeNull();
  });

  it('overwrites previous checkpoint', () => {
    const session = makeSession({ state: 'planning' });
    persistence.checkpoint(session);

    session.state = 'executing';
    persistence.checkpoint(session);

    const loaded = persistence.load('test-session-1');
    expect(loaded!.session.state).toBe('executing');
    expect(loaded!.phase).toBe('executing');
  });

  it('loadAll returns all persisted sessions', () => {
    persistence.checkpoint(makeSession({ id: 'a' }));
    persistence.checkpoint(makeSession({ id: 'b' }));
    persistence.checkpoint(makeSession({ id: 'c' }));

    const all = persistence.loadAll();
    expect(all).toHaveLength(3);
    const ids = all.map((s) => s.session.id).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('loadAll returns empty array when no sessions exist', () => {
    expect(persistence.loadAll()).toEqual([]);
  });

  it('remove deletes the persisted file', () => {
    persistence.checkpoint(makeSession());
    expect(persistence.load('test-session-1')).not.toBeNull();

    persistence.remove('test-session-1');
    expect(persistence.load('test-session-1')).toBeNull();
  });

  it('remove does not throw for non-existent session', () => {
    expect(() => persistence.remove('nonexistent')).not.toThrow();
  });

  it('clear removes all persisted files', () => {
    persistence.checkpoint(makeSession({ id: 'x' }));
    persistence.checkpoint(makeSession({ id: 'y' }));

    persistence.clear();
    expect(persistence.loadAll()).toEqual([]);
  });

  it('sanitizes session ID to prevent path traversal', () => {
    const session = makeSession({ id: '../../../etc/passwd' });
    persistence.checkpoint(session);

    // File should be in the configured dir, not traversed
    const files = fs.readdirSync(dir);
    expect(files.length).toBe(1);
    expect(files[0]).not.toContain('..');
    expect(files[0]).toMatch(/\.json$/);
  });

  it('preserves task and agent data through checkpoint/load cycle', () => {
    const session = makeSession({
      tasks: [
        { id: 't1', name: 'Build UI', status: 'done' },
        { id: 't2', name: 'Write tests', status: 'in_progress' },
      ],
      agents: [
        { name: 'builder-1', role: 'builder', status: 'working' },
        { name: 'tester-1', role: 'tester', status: 'idle' },
      ],
    });
    persistence.checkpoint(session);

    const loaded = persistence.load('test-session-1')!;
    expect(loaded.session.tasks).toHaveLength(2);
    expect(loaded.session.agents).toHaveLength(2);
    expect(loaded.session.tasks[1].status).toBe('in_progress');
  });

  it('skips corrupt files in loadAll', () => {
    persistence.checkpoint(makeSession({ id: 'good' }));
    // Write a corrupt file
    fs.writeFileSync(path.join(dir, 'bad.json'), '{invalid json');

    const all = persistence.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].session.id).toBe('good');
  });
});
