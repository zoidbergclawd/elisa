/** Behavioral tests for Issue 7: Architecture refactoring.
 *
 * Covers:
 * - SessionStore: create, get, getOrThrow, has, cleanup, pruneStale, cancelAll
 */

import { describe, it, expect, vi } from 'vitest';
import { SessionStore } from '../../services/sessionStore.js';
import type { BuildSession } from '../../models/session.js';

function makeSession(id: string): BuildSession {
  return { id, state: 'idle', spec: null, tasks: [], agents: [] };
}

describe('SessionStore', () => {
  it('creates and retrieves sessions', () => {
    const store = new SessionStore();
    const session = makeSession('s1');
    store.create('s1', session);

    expect(store.has('s1')).toBe(true);
    expect(store.get('s1')?.session).toBe(session);
    expect(store.size).toBe(1);
  });

  it('getOrThrow throws for missing session', () => {
    const store = new SessionStore();
    expect(() => store.getOrThrow('missing')).toThrow('Session not found');
  });

  it('getOrThrow returns entry for existing session', () => {
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));
    const entry = store.getOrThrow('s1');
    expect(entry.session.id).toBe('s1');
  });

  it('get returns undefined for missing session', () => {
    const store = new SessionStore();
    expect(store.get('missing')).toBeUndefined();
  });

  it('scheduleCleanup removes session after delay', async () => {
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));
    store.scheduleCleanup('s1', 50); // 50ms

    expect(store.has('s1')).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    expect(store.has('s1')).toBe(false);
  });

  it('pruneStale removes old sessions', () => {
    const store = new SessionStore();
    const entry = store.create('s1', makeSession('s1'));
    // Backdate creation
    (entry as any).createdAt = Date.now() - 7_200_000; // 2 hours ago

    store.create('s2', makeSession('s2')); // recent

    const pruned = store.pruneStale(3_600_000); // 1 hour
    expect(pruned).toEqual(['s1']);
    expect(store.has('s1')).toBe(false);
    expect(store.has('s2')).toBe(true);
  });

  it('cancelAll calls all cancelFns', () => {
    const store = new SessionStore();
    const fn1 = vi.fn();
    const fn2 = vi.fn();

    const e1 = store.create('s1', makeSession('s1'));
    e1.cancelFn = fn1;
    const e2 = store.create('s2', makeSession('s2'));
    e2.cancelFn = fn2;

    store.cancelAll();
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
    expect(e1.cancelFn).toBeNull();
    expect(e2.cancelFn).toBeNull();
  });

  it('entry fields default to null', () => {
    const store = new SessionStore();
    const entry = store.create('s1', makeSession('s1'));
    expect(entry.orchestrator).toBeNull();
    expect(entry.skillRunner).toBeNull();
    expect(entry.cancelFn).toBeNull();
    expect(entry.createdAt).toBeGreaterThan(0);
  });
});
