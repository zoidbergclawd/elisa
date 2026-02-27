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

export class ConversationManager {
  private sessions = new Map<string, ConversationSession>();
  /** Index: agentId -> set of sessionIds */
  private agentSessions = new Map<string, Set<string>>();
  private maxWindow: number;
  private consentManager?: ConsentManager;

  constructor(maxWindow = DEFAULT_MAX_WINDOW, consentManager?: ConsentManager) {
    this.maxWindow = maxWindow;
    this.consentManager = consentManager;
  }

  /**
   * Create a new conversation session for an agent.
   */
  createSession(agentId: string): ConversationSession {
    const sessionId = randomUUID();
    const session: ConversationSession = {
      session_id: sessionId,
      agent_id: agentId,
      turns: [],
      created_at: Date.now(),
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

    // Window management: truncate older turns when context gets too long.
    // TODO: Replace truncation with summarization of older turns.
    if (session.turns.length > this.maxWindow) {
      const keepCount = Math.max(1, Math.floor(this.maxWindow * TRUNCATION_RATIO));
      session.turns = session.turns.slice(-keepCount);
    }

    return turn;
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
