/** Planning Mode service: conversational planning via Claude SDK (PRD-004). */

import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from '../utils/anthropicClient.js';
import { withTimeout } from '../utils/withTimeout.js';
import {
  DEFAULT_MODEL,
  PLANNING_TURN_TIMEOUT_MS,
  PLANNING_MAX_TURNS,
  PLANNING_MAX_TOKENS,
} from '../utils/constants.js';
import {
  PlanningTurnOutputLenientSchema,
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

    // For multi_select, optionValue is comma-joined (e.g. "a, b, c").
    // Apply mutations for each individual option value.
    const values = optionValue.includes(', ') ? optionValue.split(', ') : [optionValue];
    for (const val of values) {
      const mutation = session.currentMutationMap[val];
      if (mutation) {
        this.applyMutations(session.plan, mutation);
      }
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

  /** Generate canvas blocks deterministically from the finalized plan state. */
  async generateCanvas(sessionId: string): Promise<CanvasBlockSpec> {
    const session = this.getSessionOrThrow(sessionId);

    if (!session.plan.ready) {
      throw new Error('Plan is not ready for canvas generation');
    }

    session.status = 'generating';
    session.updatedAt = Date.now();

    const blocks = planToCanvasBlocks(session.plan);

    session.generatedBlocks = blocks;
    session.status = 'generated';
    session.updatedAt = Date.now();

    return blocks;
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

  /** Save plan + conversation to the workspace .elisa/ directory. */
  savePlan(sessionId: string, workspacePath: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const elisaDir = path.join(workspacePath, '.elisa');
      if (!fs.existsSync(elisaDir)) {
        fs.mkdirSync(elisaDir, { recursive: true });
      }

      const data = {
        plan: session.plan,
        conversation: session.conversationHistory,
        status: session.status,
        canvasContext: session.canvasContext,
        generatedBlocks: session.generatedBlocks,
        savedAt: new Date().toISOString(),
      };

      const filePath = path.join(elisaDir, 'plan.json');
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.copyFileSync(tmp, filePath);
      fs.unlinkSync(tmp);
    } catch (err) {
      console.warn('[planning] save failed:', (err as Error).message);
    }
  }

  /** Load plan + conversation from workspace .elisa/ directory. Returns null if not found. */
  loadPlan(sessionId: string, workspacePath: string): PlanningSession | null {
    try {
      const filePath = path.join(workspacePath, '.elisa', 'plan.json');
      if (!fs.existsSync(filePath)) return null;

      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as {
        plan: PlanState;
        conversation: PlanningMessage[];
        status: PlanningStatus;
        canvasContext?: CanvasContext | null;
        generatedBlocks?: CanvasBlockSpec | null;
      };

      const session = this.resumePlanning(sessionId, data.plan, data.conversation);
      if (data.canvasContext) session.canvasContext = data.canvasContext;
      if (data.generatedBlocks) session.generatedBlocks = data.generatedBlocks;
      if (data.status) session.status = data.status;

      return session;
    } catch (err) {
      console.warn('[planning] load failed:', (err as Error).message);
      return null;
    }
  }

  // --- Private helpers ---

  private getSessionOrThrow(sessionId: string): PlanningSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No planning session found for ${sessionId}`);
    }
    return session;
  }

  /** Force the plan to ready state when the turn limit is reached.
   *  Auto-fills missing skills and proofs so the plan is buildable. */
  private forceReadiness(session: PlanningSession): PlanningTurnResult {
    console.log(`[planning] turn ${session.plan.conversation_turn} >= max ${PLANNING_MAX_TURNS}, forcing readiness`);

    // Auto-fill missing skills from the plan goal
    if (session.plan.skills.length === 0 && session.plan.goal.description) {
      session.plan.skills.push({
        name: session.plan.goal.description,
        description: `Build the core functionality for: ${session.plan.goal.description}`,
      });
    }

    // Auto-generate a proof for any promise that's missing one
    for (const promise of session.plan.promises) {
      if (promise.proofs.length === 0) {
        promise.proofs.push({
          description: `${promise.description} works as expected`,
        });
      }
    }

    session.plan.ready = true;
    session.plan.open_questions = [];
    session.status = 'ready';
    return {
      message: 'We have been planning for a while! I think we have enough to start building. Let me put this together for you.',
      question: null,
      plan: { ...session.plan },
      teaching: null,
      status: 'ready',
    };
  }

  private async callClaude(
    session: PlanningSession,
    userMessage: string,
  ): Promise<PlanningTurnResult> {
    if (session.plan.conversation_turn >= PLANNING_MAX_TURNS) {
      return this.forceReadiness(session);
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

    return this.callClaudeWithHistory(session);
  }

  /**
   * Generate the next question from Claude after a structured answer.
   * Does NOT add any user message -- just calls Claude with the current history.
   */
  async generateNextQuestion(sessionId: string): Promise<PlanningTurnResult> {
    const session = this.getSessionOrThrow(sessionId);

    if (session.plan.conversation_turn >= PLANNING_MAX_TURNS) {
      return this.forceReadiness(session);
    }

    if (!this.client) {
      this.client = getAnthropicClient();
    }

    return this.callClaudeWithHistory(session);
  }

  /** Core Claude call: sends current conversation history and parses the response. */
  private async callClaudeWithHistory(session: PlanningSession): Promise<PlanningTurnResult> {
    const systemPrompt = buildPlanningSystemPrompt(
      session.plan,
      session.canvasContext,
    );

    const claudeMessages = this.toClaudeMessages(session.conversationHistory);

    console.log(`[planning] calling Claude (turn ${session.plan.conversation_turn}, ${claudeMessages.length} messages, plan ready=${session.plan.ready})`);

    const response = await withTimeout(
      this.client!.messages.create({
        model: this.model,
        max_tokens: PLANNING_MAX_TOKENS,
        system: systemPrompt,
        messages: claudeMessages,
      }),
      PLANNING_TURN_TIMEOUT_MS,
    );

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    console.log(`[planning] Claude response (${raw.length} chars): ${raw.slice(0, 200)}${raw.length > 200 ? '...' : ''}`);

    const parsed = this.tryParseJsonResponse(raw);

    if (parsed) {
      const normalized = this.normalizeResponse(parsed);
      const validated = PlanningTurnOutputLenientSchema.safeParse(normalized);
      if (validated.success) {
        console.log(`[planning] validated OK: question=${validated.data.question ? validated.data.question.type : 'null'}, ready=${validated.data.plan.ready}`);
        return this.processValidatedOutput(session, validated.data);
      }
      console.warn(`[planning] validation failed (will retry):`, JSON.stringify(validated.error.issues));
    } else {
      console.warn(`[planning] JSON parse failed (will retry), raw starts with: ${raw.slice(0, 100)}`);
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
      console.error('[planning] retry also failed to produce JSON');
      throw new Error('Planning agent failed to produce valid JSON after retry');
    }

    const normalized = this.normalizeResponse(parsed);
    const validated = PlanningTurnOutputLenientSchema.safeParse(normalized);
    if (!validated.success) {
      console.error('[planning] retry validation failed:', JSON.stringify(validated.error.issues));
      throw new Error(`Planning agent failed to produce valid output after retry: ${JSON.stringify(validated.error.issues)}`);
    }
    console.log(`[planning] retry succeeded: question=${validated.data.question ? validated.data.question.type : 'null'}`)

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
    if (plan.skills.length < 1) return false;
    if (plan.deploy.target === null) return false;
    if (plan.open_questions.length > 0) return false;
    // Portals are optional -- many projects (web games, CLI tools) don't need external integrations
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

  /**
   * Normalize Claude's response to match our expected schema.
   * Handles common quirks like wrong field names or misplaced fields.
   */
  private normalizeResponse(parsed: Record<string, unknown>): Record<string, unknown> {
    // Fix question object: Claude sometimes uses "prompt" instead of "text"
    if (parsed.question && typeof parsed.question === 'object' && parsed.question !== null) {
      const q = parsed.question as Record<string, unknown>;
      if (!q.text && q.prompt && typeof q.prompt === 'string') {
        q.text = q.prompt;
      }
      // Remove fields that don't belong inside question (Claude sometimes nests teaching here)
      delete q.prompt;
      delete q.teaching;
      delete q.plan_mutation_map;
    }

    // If teaching was placed inside question, move it to top level
    if (
      !parsed.teaching &&
      parsed.question &&
      typeof parsed.question === 'object' &&
      (parsed.question as Record<string, unknown>).teaching
    ) {
      parsed.teaching = (parsed.question as Record<string, unknown>).teaching;
      delete (parsed.question as Record<string, unknown>).teaching;
    }

    // Normalize portals: Claude adds extra keys and uses non-enum subtypes
    if (parsed.plan && typeof parsed.plan === 'object') {
      const plan = parsed.plan as Record<string, unknown>;
      if (Array.isArray(plan.portals)) {
        const validSubtypes = new Set(['api', 'device', 'knowledge', 'service']);
        const subtypeMap: Record<string, string> = {
          input: 'device', hardware: 'device', sensor: 'device',
          output: 'device', database: 'service', storage: 'service',
          web: 'api', http: 'api', rest: 'api', external: 'api',
          file: 'knowledge', data: 'knowledge', content: 'knowledge',
        };
        for (const portal of plan.portals as Record<string, unknown>[]) {
          // Remove extra keys Claude adds
          delete portal.type;
          delete portal.mechanism;
          // Fix invalid subtypes
          if (typeof portal.subtype === 'string' && !validSubtypes.has(portal.subtype)) {
            portal.subtype = subtypeMap[portal.subtype.toLowerCase()] ?? 'service';
          }
          if (!portal.subtype) {
            portal.subtype = 'service';
          }
        }
      }
      // Normalize promises: strip extra keys
      if (Array.isArray(plan.promises)) {
        for (const promise of plan.promises as Record<string, unknown>[]) {
          // Proofs might have extra keys
          if (Array.isArray(promise.proofs)) {
            for (const proof of promise.proofs as Record<string, unknown>[]) {
              // Keep only description
              for (const key of Object.keys(proof)) {
                if (key !== 'description') delete proof[key];
              }
            }
          }
        }
      }
    }

    // If plan is missing but there are plan-like fields at root, wrap them
    if (!parsed.plan && parsed.idea && parsed.goal) {
      const planKeys = ['idea', 'goal', 'promises', 'skills', 'portals', 'deploy', 'open_questions', 'ready', 'conversation_turn'];
      const plan: Record<string, unknown> = {};
      for (const key of planKeys) {
        if (key in parsed) {
          plan[key] = parsed[key];
        }
      }
      if (Object.keys(plan).length >= 3) {
        parsed.plan = plan;
      }
    }

    return parsed;
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

/** Deterministically convert a finalized PlanState into CanvasBlockSpec.
 *  No AI call needed -- the plan already contains all structured data. */
function planToCanvasBlocks(plan: PlanState): CanvasBlockSpec {
  let blockIndex = 0;
  const makeId = () => `plan_${(++blockIndex).toString(36).padStart(4, '0')}`;

  const Y_START = 50;
  const Y_STEP = 80;
  const X = 50;
  let y = Y_START;

  const blocks: CanvasBlockSpec['blocks'] = [];

  // Goal
  if (plan.goal.description) {
    blocks.push({
      id: makeId(),
      type: 'Goal',
      category: 'primitive',
      content: plan.goal.description,
      position: { x: X, y },
    });
    y += Y_STEP;
  }

  // Promises with child Proofs
  for (const promise of plan.promises) {
    const children = promise.proofs.map((proof) => ({
      id: makeId(),
      type: 'Proof' as const,
      category: 'primitive' as const,
      content: proof.description,
    }));

    blocks.push({
      id: makeId(),
      type: 'Promise',
      category: 'primitive',
      content: promise.description,
      position: { x: X, y },
      ...(children.length > 0 ? { children } : {}),
    });
    y += Y_STEP;
  }

  // Skills -- emitted as blocks; frontend registers them as IDE skills before
  // loading the workspace so the use_skill dropdown can resolve them.
  for (const skill of plan.skills) {
    blocks.push({
      id: makeId(),
      type: 'Skill',
      category: 'primitive',
      content: skill.name,
      position: { x: X, y },
    });
    y += Y_STEP;
  }

  // Note: Plan portals are conceptual metadata that inform the MetaPlanner.
  // They are NOT emitted as Blockly blocks because portal_tell blocks require
  // IDE-level registration (via Portals modal) which plan-level data cannot provide.

  // Deploy
  if (plan.deploy.target) {
    blocks.push({
      id: makeId(),
      type: 'Deploy',
      category: 'primitive',
      content: `Deploy to ${plan.deploy.target}`,
      position: { x: X, y },
      subtype: plan.deploy.target,
    });
  }

  return { blocks };
}
