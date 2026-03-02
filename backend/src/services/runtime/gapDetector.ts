/**
 * Gap detection for the Elisa Agent Runtime.
 *
 * Logs topics the agent couldn't answer, surfacing them as
 * "things to add to your backpack." Phase 1 is log-only: simple
 * heuristic detection with no automated remediation.
 *
 * PRD-001: Knowledge gap detection
 */

import type { GapEntry } from '../../models/runtime.js';

// ── Uncertainty Signals ──────────────────────────────────────────────

/**
 * Phrases that indicate the agent is uncertain or lacks knowledge.
 * Case-insensitive matching against the response text.
 */
const UNCERTAINTY_PHRASES: RegExp[] = [
  /\bi don'?t know\b/i,
  /\bi'?m not sure\b/i,
  /\bi don'?t have (?:that |enough )?information\b/i,
  /\bi'?m unable to (?:answer|help with) that\b/i,
  /\bi can'?t (?:answer|help with) that\b/i,
  /\bbeyond (?:my|the scope of my) knowledge\b/i,
  /\bi don'?t have (?:any )?(?:data|details|specifics) (?:on|about)\b/i,
  /\bthat'?s outside (?:my|the) (?:area|scope)\b/i,
];

/**
 * Minimum query length (chars) for a query to be considered "complex"
 * when checking short-response heuristic.
 */
const COMPLEX_QUERY_MIN_LENGTH = 30;

/**
 * Maximum response length (chars) that triggers the short-response
 * heuristic for complex queries.
 */
const SHORT_RESPONSE_THRESHOLD = 20;

// ── GapDetector ──────────────────────────────────────────────────────

export class GapDetector {
  private gaps = new Map<string, GapEntry[]>();

  /**
   * Analyze a response for knowledge gap signals.
   * If a gap is detected, it is logged for the agent.
   *
   * Returns the GapEntry if a gap was detected, or null.
   */
  detectGap(
    agentId: string,
    query: string,
    response: string,
    fallbackResponse?: string,
  ): GapEntry | null {
    const reason = this.classifyGap(query, response, fallbackResponse);
    if (!reason) return null;

    const entry: GapEntry = {
      query,
      timestamp: new Date(),
      topic: this.extractTopic(query),
      reason,
    };

    const existing = this.gaps.get(agentId) ?? [];
    existing.push(entry);
    this.gaps.set(agentId, existing);

    return entry;
  }

  /**
   * Get all detected gaps for an agent.
   */
  getGaps(agentId: string): GapEntry[] {
    return this.gaps.get(agentId) ?? [];
  }

  /**
   * Clean up gaps when an agent is deleted.
   */
  deleteAgent(agentId: string): boolean {
    return this.gaps.delete(agentId);
  }

  // ── Internal ──────────────────────────────────────────────────────

  /**
   * Classify whether a response indicates a knowledge gap.
   * Returns a reason string if a gap is detected, null otherwise.
   */
  private classifyGap(
    query: string,
    response: string,
    fallbackResponse?: string,
  ): string | null {
    // 1. Response matches the agent's fallback response exactly
    if (fallbackResponse && response.trim() === fallbackResponse.trim()) {
      return 'fallback_response';
    }

    // 2. Response contains uncertainty phrases
    for (const pattern of UNCERTAINTY_PHRASES) {
      pattern.lastIndex = 0;
      if (pattern.test(response)) {
        return 'uncertainty_phrase';
      }
    }

    // 3. Very short response for a complex query
    if (
      query.length >= COMPLEX_QUERY_MIN_LENGTH &&
      response.trim().length < SHORT_RESPONSE_THRESHOLD
    ) {
      return 'short_response';
    }

    return null;
  }

  /**
   * Extract a rough topic from the query.
   * Takes the first sentence or first N characters as the topic label.
   */
  private extractTopic(query: string): string {
    // Use first sentence (up to first period, question mark, or newline)
    const match = query.match(/^[^.?!\n]+/);
    const raw = match ? match[0].trim() : query.trim();

    // Cap at 80 characters
    if (raw.length > 80) {
      return raw.slice(0, 77) + '...';
    }
    return raw;
  }
}
