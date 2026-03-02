import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConversationManager } from './conversationManager.js';

describe('ConversationManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic operations', () => {
    it('creates and retrieves sessions', () => {
      const cm = new ConversationManager();
      const session = cm.createSession('agent-1');
      expect(session.session_id).toBeTruthy();
      expect(session.agent_id).toBe('agent-1');
      expect(cm.getSession(session.session_id)).toBe(session);
    });

    it('tracks last_active_at on session creation', () => {
      const cm = new ConversationManager();
      const before = Date.now();
      const session = cm.createSession('agent-1');
      const after = Date.now();
      expect(session.last_active_at).toBeGreaterThanOrEqual(before);
      expect(session.last_active_at).toBeLessThanOrEqual(after);
    });

    it('updates last_active_at when a turn is added', () => {
      const cm = new ConversationManager();
      const session = cm.createSession('agent-1');
      const createdAt = session.last_active_at!;

      // Advance time slightly
      vi.spyOn(Date, 'now').mockReturnValue(createdAt + 5000);
      cm.addTurn(session.session_id, 'user', 'Hello');
      expect(session.last_active_at).toBe(createdAt + 5000);
    });
  });

  describe('TTL-based cleanup (P2 #12 regression)', () => {
    it('sweepStaleSessions removes expired sessions', () => {
      // TTL of 1000ms for testing
      const cm = new ConversationManager(50, undefined, true, 1000);
      const session = cm.createSession('agent-1');

      // Session is fresh, sweep should not remove it
      expect(cm.sweepStaleSessions()).toBe(0);
      expect(cm.getSession(session.session_id)).toBeTruthy();

      // Simulate session becoming stale by backdating last_active_at
      session.last_active_at = Date.now() - 2000;

      // Now sweep should remove it
      expect(cm.sweepStaleSessions()).toBe(1);
      expect(cm.getSession(session.session_id)).toBeUndefined();
    });

    it('sweepStaleSessions keeps active sessions', () => {
      const cm = new ConversationManager(50, undefined, true, 10000);
      const session1 = cm.createSession('agent-1');
      const session2 = cm.createSession('agent-2');

      // Make session1 stale
      session1.last_active_at = Date.now() - 20000;
      // session2 stays fresh

      expect(cm.sweepStaleSessions()).toBe(1);
      expect(cm.getSession(session1.session_id)).toBeUndefined();
      expect(cm.getSession(session2.session_id)).toBeTruthy();
    });

    it('sweepStaleSessions cleans up agent session index', () => {
      const cm = new ConversationManager(50, undefined, true, 1000);
      const session = cm.createSession('agent-1');
      session.last_active_at = Date.now() - 2000;

      cm.sweepStaleSessions();

      // Agent sessions should also be cleaned up
      expect(cm.getSessions('agent-1')).toEqual([]);
    });

    it('deleteAgentSessions clears all sessions for an agent', () => {
      const cm = new ConversationManager();
      const s1 = cm.createSession('agent-1');
      const s2 = cm.createSession('agent-1');
      cm.createSession('agent-2');

      expect(cm.deleteAgentSessions('agent-1')).toBe(2);
      expect(cm.getSession(s1.session_id)).toBeUndefined();
      expect(cm.getSession(s2.session_id)).toBeUndefined();
      expect(cm.sessionCount).toBe(1); // agent-2 session remains
    });

    it('startSweep and stopSweep manage the timer', () => {
      const cm = new ConversationManager(50, undefined, true, 1000);

      // Start sweep with a very long interval (we don't actually want it to fire)
      cm.startSweep(60000);

      // Calling start again should be idempotent
      cm.startSweep(60000);

      // Stop should work without errors
      cm.stopSweep();

      // Stop again should be safe
      cm.stopSweep();
    });

    it('uses created_at as fallback when last_active_at is not set', () => {
      const cm = new ConversationManager(50, undefined, true, 1000);
      const session = cm.createSession('agent-1');
      // Manually unset last_active_at to simulate pre-existing sessions
      delete (session as any).last_active_at;
      session.created_at = Date.now() - 2000;

      expect(cm.sweepStaleSessions()).toBe(1);
      expect(cm.getSession(session.session_id)).toBeUndefined();
    });
  });
});
