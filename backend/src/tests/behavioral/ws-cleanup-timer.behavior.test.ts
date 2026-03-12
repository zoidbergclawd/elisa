/**
 * Regression test: WebSocket disconnect during build due to cleanup timer.
 *
 * Root cause: scheduleCleanup(sessionId) fires during a long build, deleting the
 * session from the store and closing all WS connections. The fix cancels the timer
 * at build start and re-arms it in .finally() after the build completes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStore } from '../../services/sessionStore.js';
import type { BuildSession } from '../../models/session.js';

// Mock SessionPersistence
vi.mock('../../utils/sessionPersistence.js', () => ({
  SessionPersistence: class {
    checkpoint = vi.fn();
    load = vi.fn();
    loadAll = vi.fn().mockReturnValue([]);
    remove = vi.fn();
    clear = vi.fn();
  },
}));

function makeSession(id: string): BuildSession {
  return { id, state: 'idle', spec: null, tasks: [], agents: [] };
}

describe('WS cleanup timer during builds (regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('BUG: cleanup timer fires mid-build and deletes the session', () => {
    const store = new SessionStore();
    const onCleanup = vi.fn();
    store.onCleanup = onCleanup;

    store.create('s1', makeSession('s1'));

    // Simulate WS connect -> scheduleCleanup (as server.ts does)
    store.scheduleCleanup('s1', 50);

    // Build takes longer than the cleanup timer
    vi.advanceTimersByTime(50);

    // Session is gone -- this was the bug
    expect(store.has('s1')).toBe(false);
    expect(onCleanup).toHaveBeenCalledWith('s1');
  });

  it('FIX: cancelCleanup at build start keeps session alive', () => {
    const store = new SessionStore();
    const onCleanup = vi.fn();
    store.onCleanup = onCleanup;

    store.create('s1', makeSession('s1'));

    // Simulate WS connect -> scheduleCleanup
    store.scheduleCleanup('s1', 50);

    // Build starts -> cancel the timer
    store.cancelCleanup('s1');

    // Timer would have fired here, but session survives
    vi.advanceTimersByTime(100);
    expect(store.has('s1')).toBe(true);
    expect(onCleanup).not.toHaveBeenCalled();
  });

  it('FIX: full build lifecycle -- timer cancelled, build runs, timer re-armed', async () => {
    const store = new SessionStore();
    const onCleanup = vi.fn();
    store.onCleanup = onCleanup;

    store.create('s1', makeSession('s1'));

    // 1. WS connect -> scheduleCleanup (5-min equivalent, using 100ms here)
    store.scheduleCleanup('s1', 100);

    // 2. Build starts -> cancel timer
    store.cancelCleanup('s1');

    // 3. Build runs for longer than the original timer
    vi.advanceTimersByTime(200);
    expect(store.has('s1')).toBe(true); // Session survived

    // 4. Build completes -> re-arm cleanup timer in .finally()
    store.scheduleCleanup('s1', 80);

    // 5. Post-build grace period passes -> session cleaned up
    vi.advanceTimersByTime(80);
    expect(store.has('s1')).toBe(false);
    expect(onCleanup).toHaveBeenCalledWith('s1');

    vi.useRealTimers();
  });

  it('pruneStale skips sessions with active WS connections', () => {
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));

    // Simulate an active WS connection
    store.isConnected = (id: string) => id === 's1';

    // Force createdAt to be old enough for pruning
    const entry = store.get('s1')!;
    entry.createdAt = Date.now() - 7_200_000; // 2 hours ago

    // pruneStale should skip s1 because it has active connections
    const pruned = store.pruneStale(3_600_000);
    expect(pruned).toHaveLength(0);
    expect(store.has('s1')).toBe(true);
  });

  it('pruneStale removes old sessions without WS connections', () => {
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));

    // No active WS connections
    store.isConnected = () => false;

    const entry = store.get('s1')!;
    entry.createdAt = Date.now() - 7_200_000; // 2 hours ago

    const pruned = store.pruneStale(3_600_000);
    expect(pruned).toEqual(['s1']);
    expect(store.has('s1')).toBe(false);
  });

  it('meeting accept resets the timer (explains intermittent survival)', () => {
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));

    // WS connect -> scheduleCleanup with 100ms timer
    store.scheduleCleanup('s1', 100);

    // 60ms in, user accepts a Buddy meeting -> timer reset
    vi.advanceTimersByTime(60);
    store.scheduleCleanup('s1', 100); // Reset as meetings.ts does

    // Original 100ms mark -- session survives because timer was reset
    vi.advanceTimersByTime(40);
    expect(store.has('s1')).toBe(true);

    // New timer fires at 100ms after reset
    vi.advanceTimersByTime(60);
    expect(store.has('s1')).toBe(false);

    vi.useRealTimers();
  });
});
