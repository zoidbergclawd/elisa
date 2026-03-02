import { describe, it, expect, beforeEach } from 'vitest';
import { UsageLimiter, DEFAULT_TIERS } from '../../services/runtime/usageLimiter.js';
import type { UsageTier } from '../../services/runtime/usageLimiter.js';

describe('UsageLimiter', () => {
  let limiter: UsageLimiter;

  beforeEach(() => {
    limiter = new UsageLimiter();
  });

  // ── Default Tiers ───────────────────────────────────────────────────

  describe('DEFAULT_TIERS', () => {
    it('defines free tier with 100 turns/day and 500k tokens/month', () => {
      expect(DEFAULT_TIERS.free.name).toBe('free');
      expect(DEFAULT_TIERS.free.max_turns_per_day).toBe(100);
      expect(DEFAULT_TIERS.free.max_tokens_per_month).toBe(500_000);
    });

    it('defines basic tier with higher limits', () => {
      expect(DEFAULT_TIERS.basic.name).toBe('basic');
      expect(DEFAULT_TIERS.basic.max_turns_per_day).toBe(500);
      expect(DEFAULT_TIERS.basic.max_tokens_per_month).toBe(2_000_000);
    });

    it('defines unlimited tier with effectively infinite limits', () => {
      expect(DEFAULT_TIERS.unlimited.name).toBe('unlimited');
      expect(DEFAULT_TIERS.unlimited.max_turns_per_day).toBe(Number.MAX_SAFE_INTEGER);
      expect(DEFAULT_TIERS.unlimited.max_tokens_per_month).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  // ── recordUsage ─────────────────────────────────────────────────────

  describe('recordUsage', () => {
    it('tracks turn count', () => {
      limiter.recordUsage('agent-1', 100);
      limiter.recordUsage('agent-1', 200);

      const usage = limiter.getUsage('agent-1');
      expect(usage.today_turns).toBe(2);
    });

    it('tracks token count', () => {
      limiter.recordUsage('agent-1', 100);
      limiter.recordUsage('agent-1', 200);

      const usage = limiter.getUsage('agent-1');
      expect(usage.month_tokens).toBe(300);
    });

    it('tracks usage per agent independently', () => {
      limiter.recordUsage('agent-1', 100);
      limiter.recordUsage('agent-2', 500);

      expect(limiter.getUsage('agent-1').month_tokens).toBe(100);
      expect(limiter.getUsage('agent-2').month_tokens).toBe(500);
    });
  });

  // ── checkLimit ──────────────────────────────────────────────────────

  describe('checkLimit', () => {
    it('allows usage when under limits', () => {
      limiter.recordUsage('agent-1', 100);
      const result = limiter.checkLimit('agent-1');

      expect(result.allowed).toBe(true);
      expect(result.remaining_turns).toBe(99); // free tier: 100 - 1
      expect(result.message).toBeUndefined();
    });

    it('allows first turn for new agent (auto-initializes)', () => {
      const result = limiter.checkLimit('new-agent');
      expect(result.allowed).toBe(true);
      expect(result.remaining_turns).toBe(100); // full free tier
    });

    it('denies when daily turn limit reached', () => {
      // Record 100 turns (free tier limit)
      for (let i = 0; i < 100; i++) {
        limiter.recordUsage('agent-1', 10);
      }

      const result = limiter.checkLimit('agent-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining_turns).toBe(0);
      expect(result.message).toContain('Daily turn limit');
    });

    it('denies when monthly token limit reached', () => {
      // Record one massive turn that exceeds monthly budget
      limiter.recordUsage('agent-1', 500_000);

      const result = limiter.checkLimit('agent-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining_turns).toBe(0);
      expect(result.message).toContain('Monthly token limit');
    });

    it('token limit check takes priority when both limits exceeded', () => {
      // Exceed both limits
      for (let i = 0; i < 100; i++) {
        limiter.recordUsage('agent-1', 5_001); // 100 * 5001 = 500,100 > 500k
      }

      const result = limiter.checkLimit('agent-1');
      expect(result.allowed).toBe(false);
      // Monthly check happens first in the code
      expect(result.message).toContain('Monthly token limit');
    });
  });

  // ── setTier / getTier ───────────────────────────────────────────────

  describe('setTier / getTier', () => {
    it('defaults to free tier', () => {
      // Access triggers auto-init
      limiter.getUsage('agent-1');
      const tier = limiter.getTier('agent-1');
      expect(tier.name).toBe('free');
    });

    it('allows upgrading to basic tier', () => {
      limiter.setTier('agent-1', DEFAULT_TIERS.basic);
      const tier = limiter.getTier('agent-1');

      expect(tier.name).toBe('basic');
      expect(tier.max_turns_per_day).toBe(500);
    });

    it('allows upgrading to unlimited tier', () => {
      limiter.setTier('agent-1', DEFAULT_TIERS.unlimited);
      const tier = limiter.getTier('agent-1');

      expect(tier.name).toBe('unlimited');
    });

    it('applies custom tier', () => {
      const custom: UsageTier = {
        name: 'basic',
        max_turns_per_day: 250,
        max_tokens_per_month: 1_000_000,
      };

      limiter.setTier('agent-1', custom);
      const tier = limiter.getTier('agent-1');
      expect(tier.max_turns_per_day).toBe(250);
      expect(tier.max_tokens_per_month).toBe(1_000_000);
    });

    it('higher tier allows more usage', () => {
      // Fill free tier
      for (let i = 0; i < 100; i++) {
        limiter.recordUsage('agent-1', 10);
      }
      expect(limiter.checkLimit('agent-1').allowed).toBe(false);

      // Upgrade to basic
      limiter.setTier('agent-1', DEFAULT_TIERS.basic);
      expect(limiter.checkLimit('agent-1').allowed).toBe(true);
      expect(limiter.checkLimit('agent-1').remaining_turns).toBe(400);
    });

    it('tier change does not affect stored tier of original object', () => {
      const custom: UsageTier = {
        name: 'basic',
        max_turns_per_day: 250,
        max_tokens_per_month: 1_000_000,
      };

      limiter.setTier('agent-1', custom);
      custom.max_turns_per_day = 9999; // mutate original

      const tier = limiter.getTier('agent-1');
      expect(tier.max_turns_per_day).toBe(250); // should still be 250
    });
  });

  // ── getUsage ────────────────────────────────────────────────────────

  describe('getUsage', () => {
    it('returns zeros for new agent', () => {
      const usage = limiter.getUsage('new-agent');
      expect(usage.today_turns).toBe(0);
      expect(usage.month_tokens).toBe(0);
    });

    it('accumulates usage correctly', () => {
      limiter.recordUsage('agent-1', 100);
      limiter.recordUsage('agent-1', 200);
      limiter.recordUsage('agent-1', 300);

      const usage = limiter.getUsage('agent-1');
      expect(usage.today_turns).toBe(3);
      expect(usage.month_tokens).toBe(600);
    });
  });

  // ── reset ───────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears usage for an agent', () => {
      limiter.recordUsage('agent-1', 100);
      limiter.reset('agent-1');

      const usage = limiter.getUsage('agent-1');
      expect(usage.today_turns).toBe(0);
      expect(usage.month_tokens).toBe(0);
    });

    it('resets tier to free', () => {
      limiter.setTier('agent-1', DEFAULT_TIERS.unlimited);
      limiter.reset('agent-1');

      const tier = limiter.getTier('agent-1');
      expect(tier.name).toBe('free');
    });

    it('does not affect other agents', () => {
      limiter.recordUsage('agent-1', 100);
      limiter.recordUsage('agent-2', 200);
      limiter.reset('agent-1');

      expect(limiter.getUsage('agent-2').month_tokens).toBe(200);
    });
  });

  // ── size ────────────────────────────────────────────────────────────

  describe('size', () => {
    it('tracks number of agents', () => {
      expect(limiter.size).toBe(0);

      limiter.recordUsage('agent-1', 100);
      expect(limiter.size).toBe(1);

      limiter.recordUsage('agent-2', 200);
      expect(limiter.size).toBe(2);

      limiter.reset('agent-1');
      expect(limiter.size).toBe(1);
    });
  });
});
