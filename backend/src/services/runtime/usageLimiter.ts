/**
 * Usage limiter for the Elisa Agent Runtime.
 *
 * Tracks and enforces per-agent usage limits. Supports tiered usage
 * (free, basic, unlimited) with daily turn limits and monthly token budgets.
 *
 * In-memory storage, consistent with existing patterns.
 *
 * PRD-001 Section 6: Usage controls
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface UsageTier {
  name: 'free' | 'basic' | 'unlimited';
  max_turns_per_day: number;
  max_tokens_per_month: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  remaining_turns: number;
  message?: string;
}

export interface UsageSnapshot {
  today_turns: number;
  month_tokens: number;
}

// ── Default Tiers ─────────────────────────────────────────────────────

export const DEFAULT_TIERS: Record<string, UsageTier> = {
  free: {
    name: 'free',
    max_turns_per_day: 100,
    max_tokens_per_month: 500_000,
  },
  basic: {
    name: 'basic',
    max_turns_per_day: 500,
    max_tokens_per_month: 2_000_000,
  },
  unlimited: {
    name: 'unlimited',
    max_turns_per_day: Number.MAX_SAFE_INTEGER,
    max_tokens_per_month: Number.MAX_SAFE_INTEGER,
  },
};

// ── Internal State ────────────────────────────────────────────────────

interface AgentUsageState {
  tier: UsageTier;
  /** Turns recorded today. Reset daily. */
  today_turns: number;
  /** Date string (YYYY-MM-DD) of the last turn. Used for daily reset. */
  today_date: string;
  /** Tokens used this month. Reset monthly. */
  month_tokens: number;
  /** Month key (YYYY-MM) of the current month bucket. Used for monthly reset. */
  month_key: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getMonthKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

// ── Usage Limiter ─────────────────────────────────────────────────────

export class UsageLimiter {
  private state = new Map<string, AgentUsageState>();

  /**
   * Get or initialize usage state for an agent.
   * Handles automatic daily/monthly resets.
   */
  private getState(agentId: string): AgentUsageState {
    let s = this.state.get(agentId);
    const today = getTodayDate();
    const month = getMonthKey();

    if (!s) {
      s = {
        tier: { ...DEFAULT_TIERS.free },
        today_turns: 0,
        today_date: today,
        month_tokens: 0,
        month_key: month,
      };
      this.state.set(agentId, s);
      return s;
    }

    // Daily reset
    if (s.today_date !== today) {
      s.today_turns = 0;
      s.today_date = today;
    }

    // Monthly reset
    if (s.month_key !== month) {
      s.month_tokens = 0;
      s.month_key = month;
    }

    return s;
  }

  /**
   * Record usage for an agent (one turn with a given number of tokens).
   */
  recordUsage(agentId: string, tokens: number): void {
    const s = this.getState(agentId);
    s.today_turns += 1;
    s.month_tokens += tokens;
  }

  /**
   * Check whether an agent is allowed to make another turn.
   */
  checkLimit(agentId: string): LimitCheckResult {
    const s = this.getState(agentId);
    const tier = s.tier;

    // Check monthly token limit
    if (s.month_tokens >= tier.max_tokens_per_month) {
      return {
        allowed: false,
        remaining_turns: 0,
        message: `Monthly token limit reached (${tier.max_tokens_per_month.toLocaleString()} tokens). Resets next month.`,
      };
    }

    // Check daily turn limit
    if (s.today_turns >= tier.max_turns_per_day) {
      return {
        allowed: false,
        remaining_turns: 0,
        message: `Daily turn limit reached (${tier.max_turns_per_day} turns). Resets tomorrow.`,
      };
    }

    const remaining = tier.max_turns_per_day - s.today_turns;
    return {
      allowed: true,
      remaining_turns: remaining,
    };
  }

  /**
   * Get current usage snapshot for an agent.
   */
  getUsage(agentId: string): UsageSnapshot {
    const s = this.getState(agentId);
    return {
      today_turns: s.today_turns,
      month_tokens: s.month_tokens,
    };
  }

  /**
   * Set the usage tier for an agent.
   */
  setTier(agentId: string, tier: UsageTier): void {
    const s = this.getState(agentId);
    s.tier = { ...tier };
  }

  /**
   * Get the current tier for an agent.
   */
  getTier(agentId: string): UsageTier {
    const s = this.getState(agentId);
    return { ...s.tier };
  }

  /**
   * Reset all usage for an agent (for testing or admin use).
   */
  reset(agentId: string): void {
    this.state.delete(agentId);
  }

  get size(): number {
    return this.state.size;
  }
}
