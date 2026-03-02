/**
 * Conversation session manager for the Elisa Agent Runtime.
 *
 * Manages per-agent conversation sessions, turn history, and
 * context window management. In-memory for now (PostgreSQL in Phase 2).
 */

import { randomUUID } from 'node:crypto';
import type { ConversationSession, ConversationTurn } from '../../models/runtime.js';
import type { ConsentManager } from './consentManager.js';

/** Maximum turns to keep in a session before truncating older ones. */
const DEFAULT_MAX_WINDOW = 50;

/** When truncating, keep this fraction of maxWindow (60%). */
const TRUNCATION_RATIO = 0.6;

/** Number of oldest turns to summarize when the window overflows. */
const SUMMARIZE_BATCH_SIZE = 10;

/** Default session TTL in milliseconds (30 minutes). */
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

/** Default cleanup sweep interval in milliseconds (5 minutes). */
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export class ConversationManager {
  private sessions = new Map<string, ConversationSession>();
  /** Index: agentId -> set of sessionIds */
  private agentSessions = new Map<string, Set<string>>();
  private maxWindow: number;
  private consentManager?: ConsentManager;
  private useSummarization: boolean;
  private sessionTtlMs: number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    maxWindow = DEFAULT_MAX_WINDOW,
    consentManager?: ConsentManager,
    useSummarization = true,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  ) {
    this.maxWindow = maxWindow;
    this.consentManager = consentManager;
    this.useSummarization = useSummarization;
    this.sessionTtlMs = sessionTtlMs;
  }

  /**
   * Start periodic sweep to remove stale sessions.
   * Call this once at startup. Safe to call multiple times (idempotent).
   */
  startSweep(intervalMs = DEFAULT_SWEEP_INTERVAL_MS): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweepStaleSessions(), intervalMs);
    // Allow the process to exit even if the timer is still running
    if (this.sweepTimer && typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
      this.sweepTimer.unref();
    }
  }

  /**
   * Stop the periodic sweep timer.
   */
  stopSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Remove sessions that have been inactive longer than the TTL.
   * Returns the number of sessions removed.
   */
  sweepStaleSessions(): number {
    const now = Date.now();
    const cutoff = now - this.sessionTtlMs;
    let removed = 0;

    for (const [sessionId, session] of this.sessions) {
      const lastActive = session.last_active_at ?? session.created_at;
      if (lastActive < cutoff) {
        this.deleteSession(sessionId);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Create a new conversation session for an agent.
   */
  createSession(agentId: string): ConversationSession {
    const sessionId = randomUUID();
    const now = Date.now();
    const session: ConversationSession = {
      session_id: sessionId,
      agent_id: agentId,
      turns: [],
      created_at: now,
      last_active_at: now,
    };

    this.sessions.set(sessionId, session);

    // Index by agent
    if (!this.agentSessions.has(agentId)) {
      this.agentSessions.set(agentId, new Set());
    }
    this.agentSessions.get(agentId)!.add(sessionId);

    return session;
  }

  /**
   * Add a conversation turn to a session.
   * Triggers window management if the session exceeds maxWindow.
   *
   * Consent-aware storage:
   * - 'full_transcripts': store full turn (default behavior)
   * - 'session_summaries': store turn but mark for summary-only retention
   * - 'no_history': skip storage entirely, return the turn without persisting
   */
  addTurn(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    tokensUsed?: number,
  ): ConversationTurn {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const turn: ConversationTurn = {
      role,
      content,
      timestamp: Date.now(),
      tokens_used: tokensUsed,
    };

    // Check consent-based storage policy
    if (this.consentManager) {
      const policy = this.consentManager.getStoragePolicy(session.agent_id);

      if (policy === 'no_history') {
        // Don't persist the turn at all
        return turn;
      }

      if (policy === 'session_summaries') {
        // Store the turn but mark for summary-only retention
        turn.summary_only = true;
      }
    }

    session.turns.push(turn);
    session.last_active_at = Date.now();

    // Window management: summarize or truncate older turns when context gets too long.
    if (session.turns.length > this.maxWindow) {
      if (this.useSummarization) {
        this.summarizeOlderTurns(session);
      } else {
        const keepCount = Math.max(1, Math.floor(this.maxWindow * TRUNCATION_RATIO));
        session.turns = session.turns.slice(-keepCount);
      }
    }

    return turn;
  }

  /**
   * Summarize the oldest turns in a session and replace them with a single summary turn.
   * Uses a local heuristic (no API calls) to extract key topics, names, and decisions.
   */
  private summarizeOlderTurns(session: ConversationSession): void {
    const batchSize = Math.min(SUMMARIZE_BATCH_SIZE, session.turns.length - 1);
    if (batchSize < 2) return;

    const oldTurns = session.turns.slice(0, batchSize);
    const remaining = session.turns.slice(batchSize);

    const summaryText = summarizeTurns(oldTurns);

    const summaryTurn: ConversationTurn = {
      role: 'assistant',
      content: summaryText,
      timestamp: oldTurns[oldTurns.length - 1].timestamp,
    };

    session.turns = [summaryTurn, ...remaining];
  }

  /**
   * Get conversation history for a session.
   * @param sessionId Session ID
   * @param limit Maximum number of turns to return (most recent)
   */
  getHistory(sessionId: string, limit?: number): ConversationTurn[] {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    if (limit && limit > 0) {
      return session.turns.slice(-limit);
    }
    return [...session.turns];
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): ConversationSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions for an agent.
   */
  getSessions(agentId: string): ConversationSession[] {
    const sessionIds = this.agentSessions.get(agentId);
    if (!sessionIds) return [];

    const sessions: ConversationSession[] = [];
    for (const id of sessionIds) {
      const session = this.sessions.get(id);
      if (session) sessions.push(session);
    }
    return sessions;
  }

  /**
   * Delete a specific session.
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove from agent index
    const agentSessionSet = this.agentSessions.get(session.agent_id);
    if (agentSessionSet) {
      agentSessionSet.delete(sessionId);
      if (agentSessionSet.size === 0) {
        this.agentSessions.delete(session.agent_id);
      }
    }

    return this.sessions.delete(sessionId);
  }

  /**
   * Delete all sessions for an agent.
   */
  deleteAgentSessions(agentId: string): number {
    const sessionIds = this.agentSessions.get(agentId);
    if (!sessionIds) return 0;

    let count = 0;
    for (const id of sessionIds) {
      if (this.sessions.delete(id)) count++;
    }
    this.agentSessions.delete(agentId);
    return count;
  }

  /**
   * Format conversation history as Claude messages.
   */
  formatForClaude(sessionId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));
  }

  get sessionCount(): number {
    return this.sessions.size;
  }
}

// ── Heuristic Summarizer (no API calls) ────────────────────────────────

/** Words to skip when extracting topics. */
const STOP_WORDS = new Set([
  'i', 'me', 'my', 'you', 'your', 'we', 'our', 'the', 'a', 'an', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'shall',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'about', 'that', 'this', 'it', 'its', 'not', 'no', 'but', 'or', 'and',
  'if', 'then', 'so', 'than', 'what', 'how', 'when', 'where', 'which', 'who',
  'there', 'here', 'just', 'also', 'very', 'really', 'too', 'more', 'some',
  'any', 'all', 'each', 'every', 'much', 'many', 'like', 'well', 'only',
  'up', 'out', 'them', 'they', 'he', 'she', 'his', 'her',
]);

/** Extract capitalized names (2+ chars, not sentence-start) from text. */
function extractNames(text: string): Set<string> {
  const names = new Set<string>();
  // Match capitalized words that aren't at the start of a sentence.
  const matches = text.match(/(?<=[.!?]\s+\w+\s+|,\s*|\s+)[A-Z][a-z]{1,}/g);
  if (matches) {
    for (const m of matches) {
      if (!STOP_WORDS.has(m.toLowerCase())) names.add(m);
    }
  }
  return names;
}

/** Extract the most frequent meaningful words as topics. */
function extractTopics(turns: ConversationTurn[], maxTopics = 5): string[] {
  const freq = new Map<string, number>();

  for (const turn of turns) {
    const words = turn.content.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    for (const w of words) {
      if (w.length > 2 && !STOP_WORDS.has(w)) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopics)
    .map(([word]) => word);
}

/** Count questions in the given turns. */
function countQuestions(turns: ConversationTurn[]): number {
  let count = 0;
  for (const turn of turns) {
    const matches = turn.content.match(/\?/g);
    if (matches) count += matches.length;
  }
  return count;
}

/** Produce a local summary of a batch of conversation turns. */
export function summarizeTurns(turns: ConversationTurn[]): string {
  if (turns.length === 0) return '';

  const allText = turns.map((t) => t.content).join(' ');
  const names = extractNames(allText);
  const topics = extractTopics(turns);
  const questionCount = countQuestions(turns);
  const userTurnCount = turns.filter((t) => t.role === 'user').length;
  const assistantTurnCount = turns.filter((t) => t.role === 'assistant').length;

  const parts: string[] = ['[Summary of earlier conversation]'];

  if (topics.length > 0) {
    parts.push(`Topics discussed: ${topics.join(', ')}.`);
  }

  if (names.size > 0) {
    parts.push(`Names mentioned: ${[...names].join(', ')}.`);
  }

  const keyPoints: string[] = [];
  if (questionCount > 0) {
    keyPoints.push(`${questionCount} question${questionCount > 1 ? 's' : ''} asked`);
  }
  keyPoints.push(
    `${userTurnCount} user turn${userTurnCount !== 1 ? 's' : ''} and ${assistantTurnCount} assistant turn${assistantTurnCount !== 1 ? 's' : ''}`,
  );

  parts.push(`Key points: ${keyPoints.join('; ')}.`);

  return parts.join(' ');
}
