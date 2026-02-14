import { describe, it, expect } from 'vitest';
import { TokenTracker, DEFAULT_TOKEN_BUDGET, BUDGET_WARNING_THRESHOLD, DEFAULT_RESERVED_PER_TASK } from './tokenTracker.js';

describe('TokenTracker', () => {
  it('has default budget of 500_000', () => {
    expect(DEFAULT_TOKEN_BUDGET).toBe(500_000);
    const t = new TokenTracker();
    expect(t.maxBudget).toBe(500_000);
  });

  it('accepts custom budget', () => {
    const t = new TokenTracker(100_000);
    expect(t.maxBudget).toBe(100_000);
  });

  it('tracks input and output tokens', () => {
    const t = new TokenTracker();
    t.add(100, 50);
    expect(t.inputTokens).toBe(100);
    expect(t.outputTokens).toBe(50);
    expect(t.total).toBe(150);
  });

  it('tracks per-agent tokens and cost', () => {
    const t = new TokenTracker();
    t.addForAgent('bot-a', 100, 50, 0.01);
    t.addForAgent('bot-b', 200, 80, 0.02);
    expect(t.costUsd).toBeCloseTo(0.03);
    expect(t.total).toBe(430);
  });

  it('budgetExceeded is false when under budget', () => {
    const t = new TokenTracker(1000);
    t.add(400, 100);
    expect(t.budgetExceeded).toBe(false);
  });

  it('budgetExceeded is true when at budget', () => {
    const t = new TokenTracker(1000);
    t.add(600, 400);
    expect(t.budgetExceeded).toBe(true);
  });

  it('budgetExceeded is true when over budget', () => {
    const t = new TokenTracker(1000);
    t.add(800, 500);
    expect(t.budgetExceeded).toBe(true);
  });

  it('checkWarning fires once at 80% threshold', () => {
    const t = new TokenTracker(1000);
    t.add(300, 100); // 40%
    expect(t.checkWarning()).toBe(false);
    t.add(300, 100); // 80%
    expect(t.checkWarning()).toBe(true);
    // Second call should not fire again
    expect(t.checkWarning()).toBe(false);
  });

  it('checkWarning does not fire below threshold', () => {
    const t = new TokenTracker(1000);
    t.add(300, 100); // 40%
    expect(t.checkWarning()).toBe(false);
  });

  it('checkWarning fires when well above threshold', () => {
    const t = new TokenTracker(1000);
    t.add(500, 500); // 100%
    expect(t.checkWarning()).toBe(true);
    expect(t.checkWarning()).toBe(false);
  });

  it('budgetRemaining returns correct value', () => {
    const t = new TokenTracker(1000);
    expect(t.budgetRemaining).toBe(1000);
    t.add(300, 200);
    expect(t.budgetRemaining).toBe(500);
  });

  it('budgetRemaining never goes below 0', () => {
    const t = new TokenTracker(100);
    t.add(500, 500);
    expect(t.budgetRemaining).toBe(0);
  });

  it('BUDGET_WARNING_THRESHOLD is 0.8', () => {
    expect(BUDGET_WARNING_THRESHOLD).toBe(0.8);
  });

  it('snapshot includes budget fields', () => {
    const t = new TokenTracker(10_000);
    t.addForAgent('bot', 100, 50, 0.01);
    const snap = t.snapshot();
    expect(snap.input_tokens).toBe(100);
    expect(snap.output_tokens).toBe(50);
    expect(snap.total).toBe(150);
    expect(snap.reserved_tokens).toBe(0);
    expect(snap.effective_total).toBe(150);
    expect(snap.cost_usd).toBeCloseTo(0.01);
    expect(snap.max_budget).toBe(10_000);
    expect(snap.budget_remaining).toBe(9_850);
    expect(snap.per_agent).toEqual({ bot: { input: 100, output: 50 } });
  });

  it('DEFAULT_RESERVED_PER_TASK is 50_000', () => {
    expect(DEFAULT_RESERVED_PER_TASK).toBe(50_000);
  });

  describe('token reservation (#80)', () => {
    it('reserve increases reservedTokens and effectiveTotal', () => {
      const t = new TokenTracker(500_000);
      t.add(100_000, 50_000);
      expect(t.reservedTokens).toBe(0);
      expect(t.effectiveTotal).toBe(150_000);

      t.reserve(50_000);
      expect(t.reservedTokens).toBe(50_000);
      expect(t.effectiveTotal).toBe(200_000);
    });

    it('releaseReservation decreases reservedTokens', () => {
      const t = new TokenTracker(500_000);
      t.reserve(50_000);
      t.reserve(50_000);
      expect(t.reservedTokens).toBe(100_000);

      t.releaseReservation(50_000);
      expect(t.reservedTokens).toBe(50_000);
    });

    it('releaseReservation does not go below zero', () => {
      const t = new TokenTracker(500_000);
      t.reserve(10_000);
      t.releaseReservation(50_000);
      expect(t.reservedTokens).toBe(0);
    });

    it('effectiveBudgetExceeded accounts for reserved tokens', () => {
      const t = new TokenTracker(200_000);
      t.add(50_000, 50_000); // total = 100k
      expect(t.budgetExceeded).toBe(false);
      expect(t.effectiveBudgetExceeded).toBe(false);

      // Reserve 3 tasks worth = 150k, effective total = 250k > 200k
      t.reserve(50_000);
      t.reserve(50_000);
      t.reserve(50_000);
      expect(t.budgetExceeded).toBe(false);       // actual total still 100k
      expect(t.effectiveBudgetExceeded).toBe(true); // effective = 250k
    });

    it('budgetExceeded is unaffected by reservations', () => {
      const t = new TokenTracker(200_000);
      t.add(50_000, 50_000);
      t.reserve(200_000);
      // budgetExceeded only considers actual tokens
      expect(t.budgetExceeded).toBe(false);
      expect(t.total).toBe(100_000);
    });
  });
});
