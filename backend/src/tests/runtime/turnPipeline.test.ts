/** Tests for TurnPipeline: full turn flow (mock Claude API), tool execution, error handling. */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentStore } from '../../services/runtime/agentStore.js';
import { ConversationManager } from '../../services/runtime/conversationManager.js';
import { TurnPipeline, UsageTracker } from '../../services/runtime/turnPipeline.js';

// ── Mock Anthropic Client ────────────────────────────────────────────

function createMockClient(responseText = 'Mock response from Claude') {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  } as any;
}

function createFailingClient(errorMessage = 'API Error') {
  return {
    messages: {
      create: vi.fn().mockRejectedValue(new Error(errorMessage)),
    },
  } as any;
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeSpec(): Record<string, any> {
  return {
    nugget: { goal: 'Help kids learn about dinosaurs' },
    runtime: {
      agent_name: 'Dino Bot',
      greeting: 'Roar! Hello!',
      fallback_response: "Hmm, I'm not sure about that fossil...",
    },
  };
}

function makeSpecWithTools(): Record<string, any> {
  return {
    ...makeSpec(),
    portals: [
      {
        id: 'weather-portal',
        name: 'get_weather',
        description: 'Get current weather',
        capabilities: { location: { type: 'string' } },
      },
    ],
  };
}

/**
 * Create a mock client that returns tool_use on the first call,
 * then a final text response on the follow-up call.
 */
function createToolUseClient(finalText = 'The weather is sunny!') {
  const client = {
    messages: {
      create: vi.fn()
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: 'Let me check the weather.' },
            { type: 'tool_use', id: 'toolu_abc', name: 'get_weather', input: { location: 'Paris' } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 80, output_tokens: 40 },
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: finalText }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 120, output_tokens: 60 },
        }),
    },
  } as any;
  return client;
}

// ── TurnPipeline ─────────────────────────────────────────────────────

describe('TurnPipeline', () => {
  let agentStore: AgentStore;
  let conversationManager: ConversationManager;
  let usageTracker: UsageTracker;
  let mockClient: any;
  let pipeline: TurnPipeline;

  beforeEach(() => {
    agentStore = new AgentStore();
    conversationManager = new ConversationManager();
    usageTracker = new UsageTracker();
    mockClient = createMockClient();

    pipeline = new TurnPipeline(
      {
        agentStore,
        conversationManager,
        getClient: () => mockClient,
      },
      usageTracker,
    );
  });

  describe('receiveTurn', () => {
    it('processes a text turn and returns a response', async () => {
      const { agent_id } = agentStore.provision(makeSpec());

      const result = await pipeline.receiveTurn(agent_id, { text: 'What is a T-Rex?' });

      expect(result.response).toBe('Mock response from Claude');
      expect(result.session_id).toBeDefined();
      expect(result.input_tokens).toBe(100);
      expect(result.output_tokens).toBe(50);
    });

    it('creates a new session when session_id is not provided', async () => {
      const { agent_id } = agentStore.provision(makeSpec());

      const result = await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

      expect(result.session_id).toBeDefined();
      expect(result.session_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('reuses existing session when session_id is provided', async () => {
      const { agent_id } = agentStore.provision(makeSpec());
      const session = conversationManager.createSession(agent_id);

      const result = await pipeline.receiveTurn(agent_id, {
        text: 'Hello!',
        session_id: session.session_id,
      });

      expect(result.session_id).toBe(session.session_id);
    });

    it('stores both user and assistant turns in conversation history', async () => {
      const { agent_id } = agentStore.provision(makeSpec());

      const result = await pipeline.receiveTurn(agent_id, { text: 'What is a T-Rex?' });

      const history = conversationManager.getHistory(result.session_id);
      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('What is a T-Rex?');
      expect(history[1].role).toBe('assistant');
      expect(history[1].content).toBe('Mock response from Claude');
    });

    it('calls Claude API with correct system prompt and history', async () => {
      const { agent_id } = agentStore.provision(makeSpec());

      await pipeline.receiveTurn(agent_id, { text: 'What is a T-Rex?' });

      expect(mockClient.messages.create).toHaveBeenCalledOnce();
      const callArgs = mockClient.messages.create.mock.calls[0][0];

      // Verify system prompt contains agent info and safety guardrails
      expect(callArgs.system).toContain('Dino Bot');
      expect(callArgs.system).toContain('Safety Rules');

      // Verify messages contain the user turn
      expect(callArgs.messages).toEqual([
        { role: 'user', content: 'What is a T-Rex?' },
      ]);
    });

    it('includes conversation history in subsequent turns', async () => {
      const { agent_id } = agentStore.provision(makeSpec());

      // First turn
      const r1 = await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

      // Second turn on same session
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Second response' }],
        usage: { input_tokens: 200, output_tokens: 75 },
      });

      await pipeline.receiveTurn(agent_id, {
        text: 'Tell me more!',
        session_id: r1.session_id,
      });

      const secondCall = mockClient.messages.create.mock.calls[1][0];
      expect(secondCall.messages).toHaveLength(3);
      expect(secondCall.messages[0]).toEqual({ role: 'user', content: 'Hello!' });
      expect(secondCall.messages[1]).toEqual({ role: 'assistant', content: 'Mock response from Claude' });
      expect(secondCall.messages[2]).toEqual({ role: 'user', content: 'Tell me more!' });
    });

    it('tracks usage after each turn', async () => {
      const { agent_id } = agentStore.provision(makeSpec());

      await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

      const totals = usageTracker.getTotals(agent_id);
      expect(totals.input_tokens).toBe(100);
      expect(totals.output_tokens).toBe(50);
    });

    it('accumulates usage across multiple turns', async () => {
      const { agent_id } = agentStore.provision(makeSpec());

      // First turn: default mock (100 input, 50 output)
      const r1 = await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

      // Second turn: custom mock (200 input, 100 output)
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response 2' }],
        usage: { input_tokens: 200, output_tokens: 100 },
      });

      await pipeline.receiveTurn(agent_id, {
        text: 'Again!',
        session_id: r1.session_id,
      });

      const totals = usageTracker.getTotals(agent_id);
      expect(totals.input_tokens).toBe(300); // 100 + 200
      expect(totals.output_tokens).toBe(150); // 50 + 100
    });

    it('throws for non-existent agent', async () => {
      await expect(
        pipeline.receiveTurn('nonexistent', { text: 'Hello!' }),
      ).rejects.toThrow('Agent not found');
    });

    it('throws for non-existent session', async () => {
      const { agent_id } = agentStore.provision(makeSpec());

      await expect(
        pipeline.receiveTurn(agent_id, {
          text: 'Hello!',
          session_id: 'nonexistent',
        }),
      ).rejects.toThrow('Session not found');
    });

    it('throws when session belongs to a different agent', async () => {
      const r1 = agentStore.provision(makeSpec());
      const r2 = agentStore.provision(makeSpec());
      const session = conversationManager.createSession(r1.agent_id);

      await expect(
        pipeline.receiveTurn(r2.agent_id, {
          text: 'Hello!',
          session_id: session.session_id,
        }),
      ).rejects.toThrow('does not belong to agent');
    });
  });

  describe('tool execution', () => {
    it('handles tool_use blocks and makes follow-up API call', async () => {
      const toolClient = createToolUseClient();
      const toolPipeline = new TurnPipeline(
        {
          agentStore,
          conversationManager,
          getClient: () => toolClient,
        },
        usageTracker,
      );

      const { agent_id } = agentStore.provision(makeSpecWithTools());
      const result = await toolPipeline.receiveTurn(agent_id, { text: 'What is the weather in Paris?' });

      // Final response should include the text from the follow-up call
      expect(result.response).toContain('The weather is sunny!');
      // Should also include intermediate text
      expect(result.response).toContain('Let me check the weather.');

      // Two API calls: initial + follow-up with tool results
      expect(toolClient.messages.create).toHaveBeenCalledTimes(2);
    });

    it('accumulates token usage across tool call round-trips', async () => {
      const toolClient = createToolUseClient();
      const toolPipeline = new TurnPipeline(
        {
          agentStore,
          conversationManager,
          getClient: () => toolClient,
        },
        usageTracker,
      );

      const { agent_id } = agentStore.provision(makeSpecWithTools());
      const result = await toolPipeline.receiveTurn(agent_id, { text: 'Weather?' });

      // 80 + 120 = 200 input, 40 + 60 = 100 output
      expect(result.input_tokens).toBe(200);
      expect(result.output_tokens).toBe(100);
    });

    it('sends tool results back to Claude in the follow-up call', async () => {
      const toolClient = createToolUseClient();
      const toolPipeline = new TurnPipeline(
        {
          agentStore,
          conversationManager,
          getClient: () => toolClient,
        },
        usageTracker,
      );

      const { agent_id } = agentStore.provision(makeSpecWithTools());
      await toolPipeline.receiveTurn(agent_id, { text: 'Weather in Paris?' });

      // Inspect the follow-up call
      const followUpArgs = toolClient.messages.create.mock.calls[1][0];

      // Should have: [user message, assistant (with tool_use), user (with tool_result)]
      const messages = followUpArgs.messages;
      expect(messages.length).toBeGreaterThanOrEqual(3);

      // Last message should contain a tool_result block
      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.content[0].type).toBe('tool_result');
      expect(lastMsg.content[0].tool_use_id).toBe('toolu_abc');
    });

    it('includes tools in API call when agent has tool_configs', async () => {
      const toolClient = createToolUseClient();
      const toolPipeline = new TurnPipeline(
        {
          agentStore,
          conversationManager,
          getClient: () => toolClient,
        },
        usageTracker,
      );

      const { agent_id } = agentStore.provision(makeSpecWithTools());
      await toolPipeline.receiveTurn(agent_id, { text: 'Hello!' });

      const firstCallArgs = toolClient.messages.create.mock.calls[0][0];
      expect(firstCallArgs.tools).toBeDefined();
      expect(firstCallArgs.tools).toHaveLength(1);
      expect(firstCallArgs.tools[0].name).toBe('get_weather');
    });

    it('does not include tools in API call when agent has no tool_configs', async () => {
      const { agent_id } = agentStore.provision(makeSpec());
      await pipeline.receiveTurn(agent_id, { text: 'Hello!' });

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
    });

    it('returns error result for unknown tool and still completes the turn', async () => {
      // Mock: Claude calls a tool not in the agent's config
      const unknownToolClient = {
        messages: {
          create: vi.fn()
            .mockResolvedValueOnce({
              content: [
                { type: 'tool_use', id: 'toolu_xyz', name: 'unknown_tool', input: {} },
              ],
              stop_reason: 'tool_use',
              usage: { input_tokens: 50, output_tokens: 30 },
            })
            .mockResolvedValueOnce({
              content: [{ type: 'text', text: 'I could not find that tool.' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 80, output_tokens: 40 },
            }),
        },
      } as any;

      const unknownPipeline = new TurnPipeline(
        {
          agentStore,
          conversationManager,
          getClient: () => unknownToolClient,
        },
        usageTracker,
      );

      const { agent_id } = agentStore.provision(makeSpecWithTools());
      const result = await unknownPipeline.receiveTurn(agent_id, { text: 'Use unknown tool' });

      // Should still complete with the final response
      expect(result.response).toContain('I could not find that tool.');

      // The tool result should have been sent as an error
      const followUpArgs = unknownToolClient.messages.create.mock.calls[1][0];
      const lastMsg = followUpArgs.messages[followUpArgs.messages.length - 1];
      expect(lastMsg.content[0].is_error).toBe(true);
      expect(lastMsg.content[0].content).toContain('Unknown tool');
    });

    it('handles no tool_use blocks as normal flow', async () => {
      // Standard mock client returns only text blocks with stop_reason 'end_turn'
      const { agent_id } = agentStore.provision(makeSpecWithTools());
      const result = await pipeline.receiveTurn(agent_id, { text: 'Just chat, no tools' });

      // Should work normally, only 1 API call
      expect(result.response).toBe('Mock response from Claude');
      expect(mockClient.messages.create).toHaveBeenCalledOnce();
    });
  });

  describe('error handling', () => {
    it('returns fallback response when Claude API fails', async () => {
      const failClient = createFailingClient('API timeout');
      const failPipeline = new TurnPipeline(
        {
          agentStore,
          conversationManager,
          getClient: () => failClient,
        },
        usageTracker,
      );

      const { agent_id } = agentStore.provision(makeSpec());

      const result = await failPipeline.receiveTurn(agent_id, { text: 'Hello!' });

      expect(result.response).toBe("Hmm, I'm not sure about that fossil...");
      expect(result.input_tokens).toBe(0);
      expect(result.output_tokens).toBe(0);
    });

    it('still stores turns in history when API fails', async () => {
      const failClient = createFailingClient();
      const failPipeline = new TurnPipeline(
        {
          agentStore,
          conversationManager,
          getClient: () => failClient,
        },
        usageTracker,
      );

      const { agent_id } = agentStore.provision(makeSpec());
      const result = await failPipeline.receiveTurn(agent_id, { text: 'Hello!' });

      const history = conversationManager.getHistory(result.session_id);
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Hello!');
      expect(history[1].content).toBe("Hmm, I'm not sure about that fossil...");
    });
  });
});

// ── UsageTracker ─────────────────────────────────────────────────────

describe('UsageTracker', () => {
  let tracker: UsageTracker;

  beforeEach(() => {
    tracker = new UsageTracker();
  });

  describe('record', () => {
    it('stores a usage record', () => {
      tracker.record('agent-1', 100, 50);

      const records = tracker.getRecords('agent-1');
      expect(records).toHaveLength(1);
      expect(records[0].input_tokens).toBe(100);
      expect(records[0].output_tokens).toBe(50);
      expect(records[0].agent_id).toBe('agent-1');
    });
  });

  describe('getRecords', () => {
    it('returns only records for specified agent', () => {
      tracker.record('agent-1', 100, 50);
      tracker.record('agent-2', 200, 75);
      tracker.record('agent-1', 150, 60);

      const records = tracker.getRecords('agent-1');
      expect(records).toHaveLength(2);
      expect(records.every((r) => r.agent_id === 'agent-1')).toBe(true);
    });

    it('returns empty array for unknown agent', () => {
      expect(tracker.getRecords('nonexistent')).toEqual([]);
    });
  });

  describe('getTotals', () => {
    it('sums token usage across records', () => {
      tracker.record('agent-1', 100, 50);
      tracker.record('agent-1', 200, 75);

      const totals = tracker.getTotals('agent-1');
      expect(totals.input_tokens).toBe(300);
      expect(totals.output_tokens).toBe(125);
    });

    it('returns zeros for unknown agent', () => {
      const totals = tracker.getTotals('nonexistent');
      expect(totals.input_tokens).toBe(0);
      expect(totals.output_tokens).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes records for specified agent', () => {
      tracker.record('agent-1', 100, 50);
      tracker.record('agent-2', 200, 75);

      tracker.clear('agent-1');

      expect(tracker.getRecords('agent-1')).toEqual([]);
      expect(tracker.getRecords('agent-2')).toHaveLength(1);
    });
  });
});
