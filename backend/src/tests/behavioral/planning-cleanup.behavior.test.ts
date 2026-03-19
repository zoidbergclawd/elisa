/**
 * Regression test: planning sessions must be cleaned up when the parent
 * build session is removed from the session store.
 *
 * Root cause: store.onCleanup in server.ts called meetingService.cleanupSession()
 * but never called planningService.deleteSession(). Planning sessions accumulated
 * in the in-memory Map indefinitely.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanningService } from '../../services/planningService.js';
import { SessionStore } from '../../services/sessionStore.js';
import type { BuildSession } from '../../models/session.js';
import type { PlanState } from '../../utils/planSchema.js';

// Mock SessionPersistence (SessionStore instantiates it)
vi.mock('../../utils/sessionPersistence.js', () => ({
  SessionPersistence: class {
    checkpoint = vi.fn();
    load = vi.fn();
    loadAll = vi.fn().mockReturnValue([]);
    remove = vi.fn();
    clear = vi.fn();
  },
}));

// Mock the Anthropic client (PlanningService imports it)
vi.mock('../../utils/anthropicClient.js', () => ({
  getAnthropicClient: () => ({
    messages: { create: vi.fn() },
  }),
}));

function makeSession(id: string): BuildSession {
  return { id, state: 'idle', spec: null, tasks: [], agents: [] };
}

function makePlan(): PlanState {
  return {
    idea: 'Test app',
    goal: { description: 'A test app', confidence: 'rough' },
    promises: [],
    skills: [],
    portals: [],
    deploy: { target: null, constraints: [] },
    open_questions: [],
    ready: false,
    conversation_turn: 0,
  };
}

describe('Planning session cleanup on session removal (regression)', () => {
  let store: SessionStore;
  let planningService: PlanningService;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new SessionStore();
    planningService = new PlanningService();

    // Wire up onCleanup the same way server.ts does
    store.onCleanup = (sessionId: string) => {
      planningService.deleteSession(sessionId);
    };
  });

  it('BUG: planning session leaks when build session is cleaned up without planning cleanup', () => {
    // Simulate the OLD behavior (no planning cleanup)
    const leakyStore = new SessionStore();
    const leakyPlanning = new PlanningService();
    leakyStore.onCleanup = () => {
      // Old code: only called meetingService.cleanupSession(), never planningService.deleteSession()
    };

    leakyStore.create('s1', makeSession('s1'));
    leakyPlanning.resumePlanning('s1', makePlan(), []);
    expect(leakyPlanning.getState('s1')).toBeDefined();

    // Session removed via cleanup timer
    leakyStore.scheduleCleanup('s1', 50);
    vi.advanceTimersByTime(50);

    // Build session is gone, but planning session LEAKS
    expect(leakyStore.has('s1')).toBe(false);
    expect(leakyPlanning.getState('s1')).toBeDefined(); // <-- the leak
  });

  it('FIX: planning session is deleted when build session is cleaned up', () => {
    store.create('s1', makeSession('s1'));
    planningService.resumePlanning('s1', makePlan(), []);
    expect(planningService.getState('s1')).toBeDefined();

    // Session removed via cleanup timer
    store.scheduleCleanup('s1', 50);
    vi.advanceTimersByTime(50);

    // Both build session and planning session are gone
    expect(store.has('s1')).toBe(false);
    expect(planningService.getState('s1')).toBeUndefined();
  });

  it('FIX: planning cleanup is safe when no planning session exists', () => {
    store.create('s1', makeSession('s1'));
    // No planning session created for this build session
    expect(planningService.getState('s1')).toBeUndefined();

    // Should not throw
    store.scheduleCleanup('s1', 50);
    vi.advanceTimersByTime(50);

    expect(store.has('s1')).toBe(false);
  });

  it('FIX: pruneStale also cleans up planning sessions', () => {
    store.create('s1', makeSession('s1'));
    store.isConnected = () => false;
    planningService.resumePlanning('s1', makePlan(), []);

    // Make session old enough for pruning
    const entry = store.get('s1')!;
    entry.createdAt = Date.now() - 7_200_000; // 2 hours ago

    const pruned = store.pruneStale(3_600_000);
    expect(pruned).toEqual(['s1']);
    expect(store.has('s1')).toBe(false);
    expect(planningService.getState('s1')).toBeUndefined();
  });

  it('FIX: multiple sessions cleaned up independently', () => {
    store.create('s1', makeSession('s1'));
    store.create('s2', makeSession('s2'));
    planningService.resumePlanning('s1', makePlan(), []);
    planningService.resumePlanning('s2', makePlan(), []);

    // Only clean up s1
    store.scheduleCleanup('s1', 50);
    vi.advanceTimersByTime(50);

    expect(planningService.getState('s1')).toBeUndefined();
    expect(planningService.getState('s2')).toBeDefined(); // s2 untouched

    vi.useRealTimers();
  });
});
