import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStore } from './sessionStore.js';
import type { BuildSession } from '../models/session.js';

// Mock SessionPersistence
const mockCheckpoint = vi.fn();
const mockLoadAll = vi.fn().mockReturnValue([]);
const mockRemove = vi.fn();
const mockClear = vi.fn();

vi.mock('../utils/sessionPersistence.js', () => ({
  SessionPersistence: vi.fn().mockImplementation(() => ({
    checkpoint: mockCheckpoint,
    load: vi.fn(),
    loadAll: mockLoadAll,
    remove: mockRemove,
    clear: mockClear,
  })),
}));

function makeSession(id: string, state: BuildSession['state'] = 'idle'): BuildSession {
  return { id, state, spec: null, tasks: [], agents: [] };
}

describe('SessionStore persistence integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAll.mockReturnValue([]);
  });

  it('checkpoints on create', () => {
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));
    expect(mockCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('checkpoint is callable manually', () => {
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));
    mockCheckpoint.mockClear();
    const entry = store.get('s1')!;
    entry.session.state = 'executing';
    store.checkpoint('s1');
    expect(mockCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', state: 'executing' }));
  });

  it('checkpoint ignores missing sessions', () => {
    const store = new SessionStore();
    store.checkpoint('nonexistent');
    expect(mockCheckpoint).not.toHaveBeenCalled();
  });

  it('checkpoint swallows persistence errors', () => {
    const store = new SessionStore();
    mockCheckpoint.mockImplementationOnce(() => { throw new Error('disk full'); });
    expect(() => store.create('s1', makeSession('s1'))).not.toThrow();
  });

  it('recovers persisted sessions on startup', () => {
    mockLoadAll.mockReturnValue([
      { session: makeSession('r1', 'executing'), savedAt: Date.now() - 1000 },
      { session: makeSession('r2', 'done'), savedAt: Date.now() - 2000 },
    ]);
    const store = new SessionStore();
    const count = store.recover();
    expect(count).toBe(2);
    expect(store.size).toBe(2);
    // Active sessions are marked done (can't restore orchestrators)
    expect(store.get('r1')!.session.state).toBe('done');
    expect(store.get('r2')!.session.state).toBe('done');
  });

  it('recover skips sessions already in memory', () => {
    mockLoadAll.mockReturnValue([
      { session: makeSession('s1', 'idle'), savedAt: Date.now() },
    ]);
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));
    const count = store.recover();
    expect(count).toBe(0);
    expect(store.size).toBe(1);
  });

  it('recover preserves idle sessions as idle', () => {
    mockLoadAll.mockReturnValue([
      { session: makeSession('r1', 'idle'), savedAt: Date.now() },
    ]);
    const store = new SessionStore();
    const count = store.recover();
    expect(count).toBe(1);
    expect(store.get('r1')!.session.state).toBe('idle');
  });

  it('recover swallows errors', () => {
    mockLoadAll.mockImplementationOnce(() => { throw new Error('corrupt'); });
    const store = new SessionStore();
    expect(store.recover()).toBe(0);
  });

  it('removes persistence file on cleanup', () => {
    vi.useFakeTimers();
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));
    store.scheduleCleanup('s1', 100);
    vi.advanceTimersByTime(100);
    expect(mockRemove).toHaveBeenCalledWith('s1');
    vi.useRealTimers();
  });

  it('removes persistence file on pruneStale', () => {
    const store = new SessionStore();
    store.create('s1', makeSession('s1'));
    // Force entry to be stale
    const entry = store.get('s1')!;
    entry.createdAt = Date.now() - 7_200_000; // 2 hours ago
    store.pruneStale(3_600_000);
    expect(mockRemove).toHaveBeenCalledWith('s1');
  });

  it('disables persistence when false is passed', () => {
    const store = new SessionStore(false);
    store.create('s1', makeSession('s1'));
    expect(mockCheckpoint).not.toHaveBeenCalled();
    expect(store.recover()).toBe(0);
  });
});
