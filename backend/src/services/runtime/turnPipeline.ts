/**
 * Turn pipeline for the Elisa Agent Runtime.
 *
 * Core conversation loop:
 *   receiveTurn(agentId, sessionId, input) ->
 *     1. Load agent identity
 *     2. Load conversation history
 *     3. Assemble context (system_prompt + history + input)
 *     4. Call Claude API (streaming)
 *     5. Handle tool calls if any
 *     6. Store turn in history
 *     7. Track usage
 *     -> return response
 *
 * No audio processing yet (Phase 2). Text-only turns for now.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AgentStore } from './agentStore.js';
import type { ConversationManager } from './conversationManager.js';
import type { ConsentManager } from './consentManager.js';
import type { KnowledgeBackpack } from './knowledgeBackpack.js';
import type { UsageRecord } from '../../models/runtime.js';
import { filterAgentResponse } from './contentFilter.js';
import { UsageLimiter } from './usageLimiter.js';
import { DEFAULT_MODEL } from '../../utils/constants.js';

// ── Types ─────────────────────────────────────────────────────────────

export interface TurnInput {
  text: string;
  session_id?: string;
}

export interface TurnResult {
  response: string;
  session_id: string;
  input_tokens: number;
  output_tokens: number;
}

export interface TurnPipelineDeps {
  agentStore: AgentStore;
  conversationManager: ConversationManager;
  getClient: () => Anthropic;
  knowledgeBackpack?: KnowledgeBackpack;
  consentManager?: ConsentManager;
}

// ── Usage Tracking ────────────────────────────────────────────────────

export class UsageTracker {
  private records: UsageRecord[] = [];

  record(agentId: string, inputTokens: number, outputTokens: number): void {
    this.records.push({
      agent_id: agentId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      tts_characters: 0,  // Phase 2
      stt_seconds: 0,     // Phase 2
      timestamp: Date.now(),
    });
  }

  getRecords(agentId: string): UsageRecord[] {
    return this.records.filter((r) => r.agent_id === agentId);
  }

  getTotals(agentId: string): { input_tokens: number; output_tokens: number } {
    const records = this.getRecords(agentId);
    return {
      input_tokens: records.reduce((sum, r) => sum + r.input_tokens, 0),
      output_tokens: records.reduce((sum, r) => sum + r.output_tokens, 0),
    };
  }

  clear(agentId: string): void {
    this.records = this.records.filter((r) => r.agent_id !== agentId);
  }
}

// ── Turn Pipeline ─────────────────────────────────────────────────────

export class TurnPipeline {
  private agentStore: AgentStore;
  private conversationManager: ConversationManager;
  private getClient: () => Anthropic;
  private usageTracker: UsageTracker;
  private usageLimiter: UsageLimiter;
  private knowledgeBackpack?: KnowledgeBackpack;
  private consentManager?: ConsentManager;
  private model: string;

  constructor(deps: TurnPipelineDeps, usageTracker?: UsageTracker, usageLimiter?: UsageLimiter) {
    this.agentStore = deps.agentStore;
    this.conversationManager = deps.conversationManager;
    this.getClient = deps.getClient;
    this.knowledgeBackpack = deps.knowledgeBackpack;
    this.consentManager = deps.consentManager;
    this.usageTracker = usageTracker ?? new UsageTracker();
    this.usageLimiter = usageLimiter ?? new UsageLimiter();
    this.model = process.env.CLAUDE_MODEL ?? DEFAULT_MODEL;
  }

  /**
   * Process a text conversation turn.
   *
   * If session_id is not provided, creates a new session.
   * Returns the assistant's response and the session_id.
   */
  async receiveTurn(agentId: string, input: TurnInput): Promise<TurnResult> {
    // 1. Load agent identity
    const identity = this.agentStore.get(agentId);
    if (!identity) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // 1b. Usage limiter pre-check
    const limitCheck = this.usageLimiter.checkLimit(agentId);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.message ?? 'Usage limit reached');
    }

    // 2. Get or create session
    let sessionId = input.session_id;
    if (!sessionId) {
      const session = this.conversationManager.createSession(agentId);
      sessionId = session.session_id;
    } else {
      // Validate session exists and belongs to this agent
      const session = this.conversationManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      if (session.agent_id !== agentId) {
        throw new Error(`Session ${sessionId} does not belong to agent ${agentId}`);
      }
    }

    // 3. Store user turn in history
    this.conversationManager.addTurn(sessionId, 'user', input.text);

    // 4. Load conversation history and assemble context
    const history = this.conversationManager.formatForClaude(sessionId);

    // 4b. Knowledge Backpack context injection
    let systemPrompt = identity.system_prompt;
    if (this.knowledgeBackpack) {
      const backpackContext = this.knowledgeBackpack.buildContext(agentId, input.text);
      if (backpackContext) {
        systemPrompt = systemPrompt + '\n\n' + backpackContext;
      }
    }

    // 5. Call Claude API
    let responseText = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const client = this.getClient();
      const response = await client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: history,
      });

      // Extract text from response content blocks
      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
        // TODO: Handle tool_use blocks when Portal integration is added
      }

      inputTokens = response.usage?.input_tokens ?? 0;
      outputTokens = response.usage?.output_tokens ?? 0;
    } catch (err: any) {
      // On API error, use fallback response
      console.error(`[TurnPipeline] Claude API error for agent ${agentId}:`, err.message);
      responseText = identity.fallback_response;
    }

    // 5b. Content filter post-processing
    const filterResult = filterAgentResponse(responseText);
    responseText = filterResult.content;
    if (filterResult.flagged) {
      console.warn(`[TurnPipeline] Content filter flagged agent ${agentId}:`, filterResult.flags);
    }

    // 6. Store assistant turn in history
    this.conversationManager.addTurn(sessionId, 'assistant', responseText, outputTokens);

    // 7. Track usage
    this.usageTracker.record(agentId, inputTokens, outputTokens);
    this.usageLimiter.recordUsage(agentId, inputTokens + outputTokens);

    return {
      response: responseText,
      session_id: sessionId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };
  }

  getUsageTracker(): UsageTracker {
    return this.usageTracker;
  }
}
