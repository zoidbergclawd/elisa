/** Integration tests: ConsentManager wired into ConversationManager and TurnPipeline. */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsentManager } from '../../services/runtime/consentManager.js';
import { ConversationManager } from '../../services/runtime/conversationManager.js';
import { AgentStore } from '../../services/runtime/agentStore.js';
import { TurnPipeline, UsageTracker } from '../../services/runtime/turnPipeline.js';

// ── Mock Anthropic Client ────────────────────────────────────────────

function createMockClient(responseText = 'Mock response') {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as any;
}

function makeSpec(): Record<string, any> {
  return {
    nugget: { goal: 'Help kids learn about space' },
    runtime: {
      agent_name: 'Space Bot',
      greeting: 'Hello, astronaut!',
      fallback_response: 'Houston, we have a problem...',
    },
  };
}

// ── ConversationManager + ConsentManager ─────────────────────────────

describe('ConversationManager with ConsentManager', () => {
  let consentManager: ConsentManager;
  let conversationManager: ConversationManager;

  beforeEach(() => {
    consentManager = new ConsentManager();
    conversationManager = new ConversationManager(undefined, consentManager);
  });

  describe('no_history consent', () => {
    it('does not store turns when consent is no_history', () => {
      const agentId = 'agent-kid-1';
      consentManager.setConsent(agentId, 'no_history', 'parent@example.com');

      const session = conversationManager.createSession(agentId);
      conversationManager.addTurn(session.session_id, 'user', 'Hello!');
      conversationManager.addTurn(session.session_id, 'assistant', 'Hi there!');

      const history = conversationManager.getHistory(session.session_id);
      expect(history).toHaveLength(0);
    });

    it('returns the turn object even when not stored', () => {
      const agentId = 'agent-kid-1';
      consentManager.setConsent(agentId, 'no_history', 'parent@example.com');

      const session = conversationManager.createSession(agentId);
      const turn = conversationManager.addTurn(session.session_id, 'user', 'Hello!');

      expect(turn.role).toBe('user');
      expect(turn.content).toBe('Hello!');
      expect(turn.timestamp).toBeDefined();
    });

    it('formatForClaude returns empty for no_history sessions', () => {
      const agentId = 'agent-kid-1';
      consentManager.setConsent(agentId, 'no_history', 'parent@example.com');

      const session = conversationManager.createSession(agentId);
      conversationManager.addTurn(session.session_id, 'user', 'Hello!');
      conversationManager.addTurn(session.session_id, 'assistant', 'Hi!');

      const messages = conversationManager.formatForClaude(session.session_id);
      expect(messages).toEqual([]);
    });
  });

  describe('session_summaries consent', () => {
    it('stores turns with summary_only flag', () => {
      const agentId = 'agent-kid-2';
      consentManager.setConsent(agentId, 'session_summaries', 'parent@example.com');

      const session = conversationManager.createSession(agentId);
      const turn = conversationManager.addTurn(session.session_id, 'user', 'Tell me about Mars');

      expect(turn.summary_only).toBe(true);

      const history = conversationManager.getHistory(session.session_id);
      expect(history).toHaveLength(1);
      expect(history[0].summary_only).toBe(true);
    });

    it('marks all turns as summary_only', () => {
      const agentId = 'agent-kid-2';
      consentManager.setConsent(agentId, 'session_summaries', 'parent@example.com');

      const session = conversationManager.createSession(agentId);
      conversationManager.addTurn(session.session_id, 'user', 'Hello');
      conversationManager.addTurn(session.session_id, 'assistant', 'Hi');

      const history = conversationManager.getHistory(session.session_id);
      expect(history).toHaveLength(2);
      expect(history.every(t => t.summary_only === true)).toBe(true);
    });
  });

  describe('full_transcripts consent', () => {
    it('stores turns normally without summary_only flag', () => {
      const agentId = 'agent-kid-3';
      consentManager.setConsent(agentId, 'full_transcripts', 'parent@example.com');

      const session = conversationManager.createSession(agentId);
      const turn = conversationManager.addTurn(session.session_id, 'user', 'Hello!');

      expect(turn.summary_only).toBeUndefined();

      const history = conversationManager.getHistory(session.session_id);
      expect(history).toHaveLength(1);
      expect(history[0].summary_only).toBeUndefined();
    });
  });

  describe('no consent record (backwards compatibility)', () => {
    it('stores turns normally when no consent record exists', () => {
      // No consentManager.setConsent() call — getStoragePolicy defaults to session_summaries
      const session = conversationManager.createSession('agent-unknown');
      const turn = conversationManager.addTurn(session.session_id, 'user', 'Hello!');

      // Default is session_summaries, so turns should have summary_only
      expect(turn.summary_only).toBe(true);

      const history = conversationManager.getHistory(session.session_id);
      expect(history).toHaveLength(1);
    });
  });

  describe('without ConsentManager (backwards compatibility)', () => {
    it('stores all turns normally when no ConsentManager is injected', () => {
      const plainManager = new ConversationManager();
      const session = plainManager.createSession('agent-1');

      const turn = plainManager.addTurn(session.session_id, 'user', 'Hello!');

      expect(turn.summary_only).toBeUndefined();

      const history = plainManager.getHistory(session.session_id);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Hello!');
    });
  });

  describe('consent level changes', () => {
    it('respects consent changes between turns', () => {
      const agentId = 'agent-kid-4';
      consentManager.setConsent(agentId, 'full_transcripts', 'parent@example.com');

      const session = conversationManager.createSession(agentId);
      conversationManager.addTurn(session.session_id, 'user', 'Turn 1');

      // Parent revokes to no_history
      consentManager.setConsent(agentId, 'no_history', 'parent@example.com');
      conversationManager.addTurn(session.session_id, 'user', 'Turn 2');

      const history = conversationManager.getHistory(session.session_id);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Turn 1');
    });
  });
});

// ── TurnPipeline + ConsentManager ────────────────────────────────────

describe('TurnPipeline with ConsentManager', () => {
  let agentStore: AgentStore;
  let consentManager: ConsentManager;
  let conversationManager: ConversationManager;
  let usageTracker: UsageTracker;
  let mockClient: any;
  let pipeline: TurnPipeline;

  beforeEach(() => {
    agentStore = new AgentStore();
    consentManager = new ConsentManager();
    conversationManager = new ConversationManager(undefined, consentManager);
    usageTracker = new UsageTracker();
    mockClient = createMockClient();

    pipeline = new TurnPipeline(
      {
        agentStore,
        conversationManager,
        getClient: () => mockClient,
        consentManager,
      },
      usageTracker,
    );
  });

  it('does not store turns when consent is no_history', async () => {
    const { agent_id } = agentStore.provision(makeSpec());
    consentManager.setConsent(agent_id, 'no_history', 'parent@example.com');

    const result = await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

    // Should still get a response
    expect(result.response).toBe('Mock response');
    expect(result.session_id).toBeDefined();

    // But no turns stored in history
    const history = conversationManager.getHistory(result.session_id);
    expect(history).toHaveLength(0);
  });

  it('marks turns as summary_only for session_summaries consent', async () => {
    const { agent_id } = agentStore.provision(makeSpec());
    consentManager.setConsent(agent_id, 'session_summaries', 'parent@example.com');

    const result = await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

    const history = conversationManager.getHistory(result.session_id);
    expect(history).toHaveLength(2);
    expect(history.every(t => t.summary_only === true)).toBe(true);
  });

  it('stores full turns for full_transcripts consent', async () => {
    const { agent_id } = agentStore.provision(makeSpec());
    consentManager.setConsent(agent_id, 'full_transcripts', 'parent@example.com');

    const result = await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

    const history = conversationManager.getHistory(result.session_id);
    expect(history).toHaveLength(2);
    expect(history[0].summary_only).toBeUndefined();
    expect(history[1].summary_only).toBeUndefined();
  });

  it('still tracks usage even with no_history consent', async () => {
    const { agent_id } = agentStore.provision(makeSpec());
    consentManager.setConsent(agent_id, 'no_history', 'parent@example.com');

    await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

    const totals = usageTracker.getTotals(agent_id);
    expect(totals.input_tokens).toBe(100);
    expect(totals.output_tokens).toBe(50);
  });

  it('works without ConsentManager (backwards compatibility)', async () => {
    const plainPipeline = new TurnPipeline(
      {
        agentStore,
        conversationManager: new ConversationManager(),
        getClient: () => mockClient,
      },
      usageTracker,
    );

    const { agent_id } = agentStore.provision(makeSpec());
    const result = await plainPipeline.receiveTurn(agent_id, { text: 'Hello!' });

    expect(result.response).toBe('Mock response');
    expect(result.session_id).toBeDefined();
  });
});
