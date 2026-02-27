/** Tests for ConversationManager: session lifecycle, history retrieval, window management. */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationManager } from '../../services/runtime/conversationManager.js';

describe('ConversationManager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager();
  });

  describe('createSession', () => {
    it('creates a session with a unique session_id', () => {
      const session = manager.createSession('agent-1');

      expect(session.session_id).toBeDefined();
      expect(session.session_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('creates a session with correct agent_id', () => {
      const session = manager.createSession('agent-1');
      expect(session.agent_id).toBe('agent-1');
    });

    it('creates a session with empty turns', () => {
      const session = manager.createSession('agent-1');
      expect(session.turns).toEqual([]);
    });

    it('creates a session with a created_at timestamp', () => {
      const before = Date.now();
      const session = manager.createSession('agent-1');
      const after = Date.now();

      expect(session.created_at).toBeGreaterThanOrEqual(before);
      expect(session.created_at).toBeLessThanOrEqual(after);
    });

    it('generates unique session_ids for multiple sessions', () => {
      const s1 = manager.createSession('agent-1');
      const s2 = manager.createSession('agent-1');
      const s3 = manager.createSession('agent-2');

      expect(s1.session_id).not.toBe(s2.session_id);
      expect(s1.session_id).not.toBe(s3.session_id);
    });

    it('increments sessionCount', () => {
      expect(manager.sessionCount).toBe(0);
      manager.createSession('agent-1');
      expect(manager.sessionCount).toBe(1);
      manager.createSession('agent-1');
      expect(manager.sessionCount).toBe(2);
    });
  });

  describe('addTurn', () => {
    it('adds a user turn to the session', () => {
      const session = manager.createSession('agent-1');
      const turn = manager.addTurn(session.session_id, 'user', 'Hello!');

      expect(turn.role).toBe('user');
      expect(turn.content).toBe('Hello!');
      expect(turn.timestamp).toBeDefined();
    });

    it('adds an assistant turn to the session', () => {
      const session = manager.createSession('agent-1');
      const turn = manager.addTurn(session.session_id, 'assistant', 'Hi there!', 50);

      expect(turn.role).toBe('assistant');
      expect(turn.content).toBe('Hi there!');
      expect(turn.tokens_used).toBe(50);
    });

    it('throws for non-existent session', () => {
      expect(() =>
        manager.addTurn('nonexistent', 'user', 'Hello!'),
      ).toThrow('Session not found');
    });

    it('stores tokens_used when provided', () => {
      const session = manager.createSession('agent-1');
      const turn = manager.addTurn(session.session_id, 'assistant', 'Response', 100);

      expect(turn.tokens_used).toBe(100);
    });

    it('tokens_used is undefined when not provided', () => {
      const session = manager.createSession('agent-1');
      const turn = manager.addTurn(session.session_id, 'user', 'Hello!');

      expect(turn.tokens_used).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    it('returns all turns for a session', () => {
      const session = manager.createSession('agent-1');
      manager.addTurn(session.session_id, 'user', 'Hello!');
      manager.addTurn(session.session_id, 'assistant', 'Hi!');
      manager.addTurn(session.session_id, 'user', 'How are you?');

      const history = manager.getHistory(session.session_id);
      expect(history).toHaveLength(3);
      expect(history[0].content).toBe('Hello!');
      expect(history[1].content).toBe('Hi!');
      expect(history[2].content).toBe('How are you?');
    });

    it('returns limited turns when limit is specified', () => {
      const session = manager.createSession('agent-1');
      manager.addTurn(session.session_id, 'user', 'Turn 1');
      manager.addTurn(session.session_id, 'assistant', 'Turn 2');
      manager.addTurn(session.session_id, 'user', 'Turn 3');
      manager.addTurn(session.session_id, 'assistant', 'Turn 4');

      const history = manager.getHistory(session.session_id, 2);
      expect(history).toHaveLength(2);
      // Should return the most recent turns
      expect(history[0].content).toBe('Turn 3');
      expect(history[1].content).toBe('Turn 4');
    });

    it('returns a copy of turns (not a reference)', () => {
      const session = manager.createSession('agent-1');
      manager.addTurn(session.session_id, 'user', 'Hello!');

      const history1 = manager.getHistory(session.session_id);
      const history2 = manager.getHistory(session.session_id);
      expect(history1).not.toBe(history2);
    });

    it('throws for non-existent session', () => {
      expect(() => manager.getHistory('nonexistent')).toThrow('Session not found');
    });
  });

  describe('getSession', () => {
    it('returns session by ID', () => {
      const session = manager.createSession('agent-1');
      const retrieved = manager.getSession(session.session_id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.session_id).toBe(session.session_id);
      expect(retrieved!.agent_id).toBe('agent-1');
    });

    it('returns undefined for non-existent session', () => {
      expect(manager.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('getSessions', () => {
    it('returns all sessions for an agent', () => {
      manager.createSession('agent-1');
      manager.createSession('agent-1');
      manager.createSession('agent-2');

      const sessions = manager.getSessions('agent-1');
      expect(sessions).toHaveLength(2);
      expect(sessions.every((s) => s.agent_id === 'agent-1')).toBe(true);
    });

    it('returns empty array for agent with no sessions', () => {
      const sessions = manager.getSessions('nonexistent');
      expect(sessions).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('removes a session', () => {
      const session = manager.createSession('agent-1');
      expect(manager.getSession(session.session_id)).toBeDefined();

      const deleted = manager.deleteSession(session.session_id);
      expect(deleted).toBe(true);
      expect(manager.getSession(session.session_id)).toBeUndefined();
    });

    it('returns false for non-existent session', () => {
      expect(manager.deleteSession('nonexistent')).toBe(false);
    });

    it('removes session from agent index', () => {
      const s1 = manager.createSession('agent-1');
      const s2 = manager.createSession('agent-1');

      manager.deleteSession(s1.session_id);

      const sessions = manager.getSessions('agent-1');
      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_id).toBe(s2.session_id);
    });

    it('decrements sessionCount', () => {
      const session = manager.createSession('agent-1');
      expect(manager.sessionCount).toBe(1);

      manager.deleteSession(session.session_id);
      expect(manager.sessionCount).toBe(0);
    });
  });

  describe('deleteAgentSessions', () => {
    it('removes all sessions for an agent', () => {
      manager.createSession('agent-1');
      manager.createSession('agent-1');
      manager.createSession('agent-2');

      const count = manager.deleteAgentSessions('agent-1');
      expect(count).toBe(2);
      expect(manager.getSessions('agent-1')).toEqual([]);
      // agent-2 sessions should be unaffected
      expect(manager.getSessions('agent-2')).toHaveLength(1);
    });

    it('returns 0 for agent with no sessions', () => {
      expect(manager.deleteAgentSessions('nonexistent')).toBe(0);
    });
  });

  describe('window management', () => {
    it('truncates older turns when window exceeds maxWindow', () => {
      // Use a small maxWindow for testing
      const smallManager = new ConversationManager(10);
      const session = smallManager.createSession('agent-1');

      // Add 15 turns (exceeds maxWindow of 10)
      for (let i = 0; i < 15; i++) {
        smallManager.addTurn(session.session_id, 'user', `Turn ${i}`);
      }

      // Should be truncated — window management keeps the most recent turns
      const history = smallManager.getHistory(session.session_id);
      expect(history.length).toBeLessThanOrEqual(10);

      // Most recent turn should still be present
      expect(history[history.length - 1].content).toBe('Turn 14');
    });

    it('does not truncate when within maxWindow', () => {
      const session = manager.createSession('agent-1');

      for (let i = 0; i < 10; i++) {
        manager.addTurn(session.session_id, 'user', `Turn ${i}`);
      }

      const history = manager.getHistory(session.session_id);
      expect(history).toHaveLength(10);
    });
  });

  describe('formatForClaude', () => {
    it('formats turns as Claude message objects', () => {
      const session = manager.createSession('agent-1');
      manager.addTurn(session.session_id, 'user', 'What is a T-Rex?');
      manager.addTurn(session.session_id, 'assistant', 'A T-Rex is a large dinosaur!');

      const messages = manager.formatForClaude(session.session_id);
      expect(messages).toEqual([
        { role: 'user', content: 'What is a T-Rex?' },
        { role: 'assistant', content: 'A T-Rex is a large dinosaur!' },
      ]);
    });

    it('returns empty array for non-existent session', () => {
      const messages = manager.formatForClaude('nonexistent');
      expect(messages).toEqual([]);
    });

    it('strips tokens_used and timestamp from output', () => {
      const session = manager.createSession('agent-1');
      manager.addTurn(session.session_id, 'assistant', 'Hello!', 50);

      const messages = manager.formatForClaude(session.session_id);
      expect(messages[0]).toEqual({ role: 'assistant', content: 'Hello!' });
      expect((messages[0] as any).tokens_used).toBeUndefined();
      expect((messages[0] as any).timestamp).toBeUndefined();
    });
  });
});
