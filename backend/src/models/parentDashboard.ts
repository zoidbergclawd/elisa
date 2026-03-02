/**
 * Parent Dashboard types for the Elisa Agent Runtime.
 *
 * Type definitions for the parent dashboard data structures.
 * The UI comes later; these types define the data contract.
 *
 * PRD-001 Section 6: Parent dashboard data
 */

import type { ConsentRecord } from '../services/runtime/consentManager.js';

// ── Session Summary ───────────────────────────────────────────────────

export interface SessionSummary {
  /** Unique session identifier. */
  session_id: string;
  /** Agent that participated in this session. */
  agent_id: string;
  /** Unix timestamp (ms) when the session started. */
  started_at: number;
  /** Duration of the session in seconds. */
  duration_seconds: number;
  /** Number of conversation turns in the session. */
  turn_count: number;
  /** One-sentence human-readable summary of the session. */
  summary: string;
  /** Topics discussed during the session. */
  topics_discussed: string[];
  /** Whether the content filter flagged any content in this session. */
  flagged_content: boolean;
}

// ── Parent Dashboard Data ─────────────────────────────────────────────

export interface ParentDashboardData {
  /** The kid account this dashboard belongs to. */
  kid_id: string;
  /** Agents created by this kid. */
  agents: Array<{
    agent_id: string;
    agent_name: string;
    created_at: number;
  }>;
  /** Recent conversation sessions (most recent first). */
  recent_sessions: SessionSummary[];
  /** Current usage statistics. */
  usage: {
    today_turns: number;
    month_tokens: number;
    tier: string;
  };
  /** Parental consent record. */
  consent: ConsentRecord;
  /** Sessions that triggered content filter flags. */
  flagged_sessions: SessionSummary[];
}
