import { describe, it, expect } from 'vitest';
import { TokenTracker, DEFAULT_TOKEN_BUDGET, BUDGET_WARNING_THRESHOLD } from './tokenTracker.js';

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
    expect(snap.cost_usd).toBeCloseTo(0.01);
    expect(snap.max_budget).toBe(10_000);
    expect(snap.budget_remaining).toBe(9_850);
    expect(snap.per_agent).toEqual({ bot: { input: 100, output: 50 } });
  });
});
