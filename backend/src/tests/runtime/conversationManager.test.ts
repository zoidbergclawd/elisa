/** Tests for ConversationManager: session lifecycle, history retrieval, window management, summarization. */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationManager, summarizeTurns } from '../../services/runtime/conversationManager.js';
import type { ConversationTurn } from '../../models/runtime.js';

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

  describe('window management (truncation)', () => {
    it('truncates older turns when window exceeds maxWindow and summarization is disabled', () => {
      // Explicitly disable summarization to test the truncation path
      const smallManager = new ConversationManager(10, undefined, false);
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

  describe('window management (summarization)', () => {
    it('summarizes older turns when window overflows (default behavior)', () => {
      // Default: summarization enabled, maxWindow=10
      const sumManager = new ConversationManager(10);
      const session = sumManager.createSession('agent-1');

      // Add 11 turns to trigger overflow (> maxWindow of 10)
      for (let i = 0; i < 11; i++) {
        sumManager.addTurn(session.session_id, 'user', `Tell me about dinosaurs turn ${i}`);
      }

      const history = sumManager.getHistory(session.session_id);

      // Turn count should be reduced: 10 oldest summarized into 1, plus 1 remaining = 2
      expect(history.length).toBeLessThan(11);

      // First turn should be a summary
      expect(history[0].content).toContain('[Summary of earlier conversation]');
      expect(history[0].role).toBe('assistant');

      // Most recent turn should still be present
      expect(history[history.length - 1].content).toBe('Tell me about dinosaurs turn 10');
    });

    it('preserves key context in summary (topics)', () => {
      const sumManager = new ConversationManager(10);
      const session = sumManager.createSession('agent-1');

      // Add turns with specific topics
      sumManager.addTurn(session.session_id, 'user', 'What is photosynthesis?');
      sumManager.addTurn(session.session_id, 'assistant', 'Photosynthesis is how plants make food from sunlight.');
      sumManager.addTurn(session.session_id, 'user', 'How does photosynthesis work in chloroplasts?');
      sumManager.addTurn(session.session_id, 'assistant', 'Chloroplasts contain chlorophyll which captures light energy.');
      for (let i = 0; i < 7; i++) {
        sumManager.addTurn(session.session_id, i % 2 === 0 ? 'user' : 'assistant', `More about plants turn ${i}`);
      }

      const history = sumManager.getHistory(session.session_id);
      const summary = history[0].content;

      // Summary should mention the topic discussed
      expect(summary).toContain('Topics discussed:');
      expect(summary).toMatch(/photosynthesis|plants|chloroplasts|chlorophyll/i);
    });

    it('preserves names mentioned in summary', () => {
      const sumManager = new ConversationManager(10);
      const session = sumManager.createSession('agent-1');

      // Add turns mentioning names
      sumManager.addTurn(session.session_id, 'user', 'I talked to Alice yesterday');
      sumManager.addTurn(session.session_id, 'assistant', 'Tell me more about Alice');
      sumManager.addTurn(session.session_id, 'user', 'She mentioned that Bob was helping');
      sumManager.addTurn(session.session_id, 'assistant', 'So Alice and Bob are working together');
      for (let i = 0; i < 7; i++) {
        sumManager.addTurn(session.session_id, i % 2 === 0 ? 'user' : 'assistant', `More conversation ${i}`);
      }

      const history = sumManager.getHistory(session.session_id);
      const summary = history[0].content;

      expect(summary).toContain('Names mentioned:');
      expect(summary).toMatch(/Alice|Bob/);
    });

    it('reduces turn count after summarization', () => {
      const sumManager = new ConversationManager(10);
      const session = sumManager.createSession('agent-1');

      // Add exactly 11 turns to trigger one summarization (batch of 10 -> 1 summary)
      for (let i = 0; i < 11; i++) {
        sumManager.addTurn(session.session_id, 'user', `Turn ${i}`);
      }

      const history = sumManager.getHistory(session.session_id);
      // 10 turns summarized into 1, plus 1 remaining = 2
      expect(history.length).toBe(2);
    });

    it('counts questions in the summary', () => {
      const sumManager = new ConversationManager(10);
      const session = sumManager.createSession('agent-1');

      sumManager.addTurn(session.session_id, 'user', 'What is gravity?');
      sumManager.addTurn(session.session_id, 'assistant', 'Gravity is a force that pulls objects together.');
      sumManager.addTurn(session.session_id, 'user', 'Why do things fall down?');
      sumManager.addTurn(session.session_id, 'assistant', 'Because gravity pulls them toward Earth.');
      for (let i = 0; i < 7; i++) {
        sumManager.addTurn(session.session_id, i % 2 === 0 ? 'user' : 'assistant', `More physics ${i}`);
      }

      const history = sumManager.getHistory(session.session_id);
      const summary = history[0].content;

      expect(summary).toContain('question');
    });

    it('falls back to truncation when summarization is disabled', () => {
      const truncManager = new ConversationManager(10, undefined, false);
      const session = truncManager.createSession('agent-1');

      for (let i = 0; i < 15; i++) {
        truncManager.addTurn(session.session_id, 'user', `Turn ${i}`);
      }

      const history = truncManager.getHistory(session.session_id);

      // After 15 turns with maxWindow=10: first overflow at 11 truncates to 6,
      // then 4 more turns are added (total 10, within window). Final count = 10.
      expect(history.length).toBeLessThanOrEqual(10);

      // Should NOT contain a summary turn
      expect(history[0].content).not.toContain('[Summary of earlier conversation]');

      // Most recent turn preserved
      expect(history[history.length - 1].content).toBe('Turn 14');
    });

    it('handles repeated summarizations as window keeps overflowing', () => {
      const sumManager = new ConversationManager(10);
      const session = sumManager.createSession('agent-1');

      // Add 25 turns — should trigger summarization multiple times
      for (let i = 0; i < 25; i++) {
        sumManager.addTurn(session.session_id, 'user', `Conversation turn number ${i}`);
      }

      const history = sumManager.getHistory(session.session_id);

      // Should always stay within maxWindow
      expect(history.length).toBeLessThanOrEqual(10);

      // Most recent turn should be present
      expect(history[history.length - 1].content).toBe('Conversation turn number 24');
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

describe('summarizeTurns', () => {
  function makeTurn(role: 'user' | 'assistant', content: string): ConversationTurn {
    return { role, content, timestamp: Date.now() };
  }

  it('returns empty string for empty input', () => {
    expect(summarizeTurns([])).toBe('');
  });

  it('includes summary header', () => {
    const turns = [makeTurn('user', 'Hello'), makeTurn('assistant', 'Hi there')];
    const result = summarizeTurns(turns);
    expect(result).toContain('[Summary of earlier conversation]');
  });

  it('extracts topics from turn content', () => {
    const turns = [
      makeTurn('user', 'Tell me about dinosaurs'),
      makeTurn('assistant', 'Dinosaurs were ancient reptiles that lived millions of years ago'),
      makeTurn('user', 'What about the biggest dinosaurs?'),
      makeTurn('assistant', 'The biggest dinosaurs were sauropods like Brachiosaurus'),
    ];
    const result = summarizeTurns(turns);
    expect(result).toContain('Topics discussed:');
    expect(result).toMatch(/dinosaurs/i);
  });

  it('counts questions correctly', () => {
    const turns = [
      makeTurn('user', 'What is a star?'),
      makeTurn('assistant', 'A star is a ball of gas'),
      makeTurn('user', 'How hot is the sun? Is it the biggest star?'),
    ];
    const result = summarizeTurns(turns);
    // 3 questions total
    expect(result).toContain('3 questions asked');
  });

  it('counts user and assistant turns', () => {
    const turns = [
      makeTurn('user', 'Hello'),
      makeTurn('assistant', 'Hi'),
      makeTurn('user', 'Bye'),
    ];
    const result = summarizeTurns(turns);
    expect(result).toContain('2 user turns');
    expect(result).toContain('1 assistant turn');
  });

  it('uses singular form for single question and turn', () => {
    const turns = [
      makeTurn('user', 'What is this?'),
    ];
    const result = summarizeTurns(turns);
    expect(result).toContain('1 question asked');
    expect(result).toContain('1 user turn');
  });
});
