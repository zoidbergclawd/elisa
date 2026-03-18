/** Planning Mode service: conversational planning via Claude SDK (PRD-004). */

import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from '../utils/anthropicClient.js';
import { withTimeout } from '../utils/withTimeout.js';
import {
  DEFAULT_MODEL,
  PLANNING_TURN_TIMEOUT_MS,
  PLANNING_CANVAS_TIMEOUT_MS,
  PLANNING_MAX_TURNS,
  PLANNING_MAX_TOKENS,
  PLANNING_CANVAS_MAX_TOKENS,
} from '../utils/constants.js';
import {
  PlanningTurnOutputSchema,
  CanvasBlockSpecSchema,
} from '../utils/planSchema.js';
import type {
  PlanState,
  PlanningTurnOutput,
  QuestionWidget,
  CanvasBlockSpec,
  TeachingAnnotation,
} from '../utils/planSchema.js';
import type {
  PlanningSession,
  PlanningMessage,
  PlanningStatus,
  CanvasContext,
} from '../models/planning.js';
import { createEmptyPlan } from '../models/planning.js';
import {
  buildPlanningSystemPrompt,
  buildPlanningOutputSchema,
} from '../prompts/planningAgent.js';

export interface PlanningTurnResult {
  message: string;
  question: QuestionWidget | null;
  plan: PlanState;
  teaching: TeachingAnnotation | null;
  status: PlanningStatus;
}

export class PlanningService {
  private sessions = new Map<string, PlanningSession>();
  private client: Anthropic | null = null;
  private model: string;

  constructor(model?: string) {
    this.model = model ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODEL;
  }

  /** Start a new planning session. Makes the first Claude call to get the opening question. */
  async startPlanning(
    sessionId: string,
    initialIdea: string,
    canvasContext?: CanvasContext | null,
  ): Promise<PlanningTurnResult> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Planning session already exists for ${sessionId}`);
    }

    const plan = createEmptyPlan(initialIdea);
    const now = Date.now();

    const session: PlanningSession = {
      sessionId,
      status: 'active',
      plan,
      conversationHistory: [],
      currentQuestion: null,
      currentMutationMap: null,
      canvasContext: canvasContext ?? null,
      learningSummary: null,
      generatedBlocks: null,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);

    // First turn: send the idea to Claude
    return this.callClaude(session, `I want to build: ${initialIdea}`);
  }

  /** Handle a structured answer (option click). Applies deterministic mutation, NO API call. */
  handleStructuredAnswer(
    sessionId: string,
    optionValue: string,
  ): PlanningTurnResult {
    const session = this.getSessionOrThrow(sessionId);

    if (!session.currentMutationMap) {
      throw new Error('No active question with mutation map');
    }

    const mutation = session.currentMutationMap[optionValue];

    if (mutation) {
      this.applyMutations(session.plan, mutation);
    }

    session.plan.conversation_turn++;
    session.updatedAt = Date.now();

    // Record the kid's answer
    session.conversationHistory.push({
      role: 'kid',
      content: optionValue,
      timestamp: Date.now(),
    });

    // Check readiness after mutation
    const ready = this.checkReadiness(session.plan);
    if (ready) {
      session.plan.ready = true;
      session.status = 'ready';
    }

    // Clear question state after answering
    session.currentQuestion = null;
    session.currentMutationMap = null;

    return {
      message: '',
      question: null,
      plan: { ...session.plan },
      teaching: null,
      status: session.status,
    };
  }

  /** Handle a free-text answer. Sends to Claude for next question + plan update. */
  async handleFreeTextAnswer(
    sessionId: string,
    text: string,
  ): Promise<PlanningTurnResult> {
    const session = this.getSessionOrThrow(sessionId);
    return this.callClaude(session, text);
  }

  /** Generate canvas blocks from the finalized plan. */
  async generateCanvas(sessionId: string): Promise<CanvasBlockSpec> {
    const session = this.getSessionOrThrow(sessionId);

    if (!session.plan.ready) {
      throw new Error('Plan is not ready for canvas generation');
    }

    session.status = 'generating';
    session.updatedAt = Date.now();

    if (!this.client) {
      this.client = getAnthropicClient();
    }

    const systemPrompt = `You are a canvas block generator for Elisa, a kids' coding IDE.
Given a finalized plan, generate Blockly canvas blocks using the 6 primitives: Goal, Promise, Proof, Skill, Portal, Deploy.

Rules:
- Each block has: id (unique string), type (one of the 6 primitives), category ("primitive"), content (description), position ({x, y})
- Promise blocks can have children (Proof blocks)
- Portal blocks should have a subtype (api, device, knowledge, service)
- Arrange blocks in a logical layout: Goal at top, Promises below, Skills and Portals to the sides, Deploy at bottom
- Output ONLY valid JSON matching the schema. No markdown, no explanation.`;

    const userMsg = `Generate canvas blocks for this plan:\n\n${JSON.stringify(session.plan, null, 2)}`;

    const response = await withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: PLANNING_CANVAS_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
      PLANNING_CANVAS_TIMEOUT_MS,
    );

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsed = this.parseJsonResponse(raw);

    const validated = CanvasBlockSpecSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Canvas generation produced invalid output: ${validated.error.message}`);
    }

    session.generatedBlocks = validated.data;
    session.status = 'generated';
    session.updatedAt = Date.now();

    return validated.data;
  }

  /** Get current planning state. */
  getState(sessionId: string): PlanningSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Resume planning from persisted state. */
  resumePlanning(
    sessionId: string,
    savedPlan: PlanState,
    savedConversation: PlanningMessage[],
  ): PlanningSession {
    const now = Date.now();
    const session: PlanningSession = {
      sessionId,
      status: savedPlan.ready ? 'ready' : 'active',
      plan: savedPlan,
      conversationHistory: savedConversation,
      currentQuestion: null,
      currentMutationMap: null,
      canvasContext: null,
      learningSummary: null,
      generatedBlocks: null,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /** Remove a planning session from memory. */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // --- Private helpers ---

  private getSessionOrThrow(sessionId: string): PlanningSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No planning session found for ${sessionId}`);
    }
    return session;
  }

  private async callClaude(
    session: PlanningSession,
    userMessage: string,
  ): Promise<PlanningTurnResult> {
    if (session.plan.conversation_turn >= PLANNING_MAX_TURNS) {
      session.plan.ready = true;
      session.status = 'ready';
      return {
        message: 'We have been planning for a while! I think we have enough to start building. Let me put this together for you.',
        question: null,
        plan: { ...session.plan },
        teaching: null,
        status: 'ready',
      };
    }

    if (!this.client) {
      this.client = getAnthropicClient();
    }

    // Record kid's message
    session.conversationHistory.push({
      role: 'kid',
      content: userMessage,
      timestamp: Date.now(),
    });

    const systemPrompt = buildPlanningSystemPrompt(
      session.plan,
      session.canvasContext,
    );

    const claudeMessages = this.toClaudeMessages(session.conversationHistory);

    const response = await withTimeout(
      this.client.messages.create({
        model: this.model,
        max_tokens: PLANNING_MAX_TOKENS,
        system: systemPrompt,
        messages: claudeMessages,
      }),
      PLANNING_TURN_TIMEOUT_MS,
    );

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsed = this.tryParseJsonResponse(raw);

    if (parsed) {
      const validated = PlanningTurnOutputSchema.safeParse(parsed);
      if (validated.success) {
        return this.processValidatedOutput(session, validated.data);
      }
    }

    // Retry once with correction prompt
    return this.retryClaudeCall(session, systemPrompt, claudeMessages, raw);
  }

  private async retryClaudeCall(
    session: PlanningSession,
    systemPrompt: string,
    originalMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
    badResponse: string,
  ): Promise<PlanningTurnResult> {
    const retryMessages = [
      ...originalMessages,
      { role: 'assistant' as const, content: badResponse },
      {
        role: 'user' as const,
        content:
          'Your response was not valid JSON matching the required schema. ' +
          'Please output ONLY a JSON object with fields: message (string), question (object or null), ' +
          'plan_mutation_map (object), plan (PlanState object). No markdown, no code fences.',
      },
    ];

    const response = await withTimeout(
      this.client!.messages.create({
        model: this.model,
        max_tokens: PLANNING_MAX_TOKENS,
        system: systemPrompt,
        messages: retryMessages,
      }),
      PLANNING_TURN_TIMEOUT_MS,
    );

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const parsed = this.tryParseJsonResponse(raw);

    if (!parsed) {
      throw new Error('Planning agent failed to produce valid JSON after retry');
    }

    const validated = PlanningTurnOutputSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Planning agent failed to produce valid output after retry: ${validated.error.message}`);
    }

    return this.processValidatedOutput(session, validated.data);
  }

  private processValidatedOutput(
    session: PlanningSession,
    output: PlanningTurnOutput,
  ): PlanningTurnResult {
    // Update plan from Claude's output
    session.plan = output.plan;
    session.plan.conversation_turn++;
    session.updatedAt = Date.now();

    // Store question and mutation map
    session.currentQuestion = output.question ?? null;
    session.currentMutationMap = output.plan_mutation_map as Record<string, Record<string, unknown> | null>;

    // Record agent message
    session.conversationHistory.push({
      role: 'agent',
      content: output.message,
      timestamp: Date.now(),
      question: output.question ?? undefined,
      teaching: output.teaching,
    });

    // Check readiness
    const ready = this.checkReadiness(session.plan);
    if (ready || output.question === null) {
      session.plan.ready = true;
      session.status = 'ready';
    }

    return {
      message: output.message,
      question: output.question ?? null,
      plan: { ...session.plan },
      teaching: output.teaching ?? null,
      status: session.status,
    };
  }

  /** Check if the plan meets all readiness criteria. */
  checkReadiness(plan: PlanState): boolean {
    if (plan.goal.confidence !== 'solid') return false;
    if (plan.promises.length < 2) return false;
    if (!plan.promises.every(p => p.proofs.length >= 1)) return false;
    if (plan.portals.length < 1) return false;
    if (plan.skills.length < 1) return false;
    if (plan.deploy.target === null) return false;
    if (plan.open_questions.length > 0) return false;
    return true;
  }

  /** Apply dot-notation mutations to the plan. */
  applyMutations(
    plan: PlanState,
    mutations: Record<string, unknown>,
  ): void {
    for (const [key, value] of Object.entries(mutations)) {
      if (key.endsWith('.push')) {
        const arrayPath = key.slice(0, -5);
        const arr = this.getNestedValue(plan, arrayPath);
        if (Array.isArray(arr)) {
          arr.push(value);
        }
      } else {
        this.setNestedValue(plan, key, value);
      }
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
  }

  private toClaudeMessages(
    history: PlanningMessage[],
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const m of history) {
      const role = m.role === 'kid' ? 'user' as const : 'assistant' as const;

      // Merge consecutive same-role messages
      if (result.length > 0 && result[result.length - 1].role === role) {
        result[result.length - 1].content += '\n' + m.content;
        continue;
      }

      result.push({ role, content: m.content });
    }

    // Claude API requires first message to be 'user' role
    if (result.length > 0 && result[0].role === 'assistant') {
      result.unshift({ role: 'user', content: '[Planning started]' });
    }

    if (result.length === 0) {
      result.push({ role: 'user', content: '[Planning started]' });
    }

    return result;
  }

  private tryParseJsonResponse(raw: string): Record<string, unknown> | null {
    const cleaned = raw.trim();
    if (!cleaned) return null;

    // Try raw JSON
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }

    // Try fenced block
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1].trim());
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch { /* fall through */ }
    }

    // Try extracting JSON object
    const jsonStart = cleaned.indexOf('{');
    if (jsonStart !== -1) {
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonEnd > jsonStart) {
        try {
          const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch { /* fall through */ }
      }
    }

    return null;
  }

  private parseJsonResponse(raw: string): Record<string, unknown> {
    const result = this.tryParseJsonResponse(raw);
    if (!result) {
      throw new Error('Failed to parse planning agent response as JSON');
    }
    return result;
  }
}
