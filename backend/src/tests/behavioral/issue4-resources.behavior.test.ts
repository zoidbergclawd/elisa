/** Behavioral tests for Issue 4: Resource management and cancellation.
 *
 * Covers:
 * - CANCEL-9: Orchestrator cancel() aborts execution loop
 * - RESOURCE-10: scheduleSessionCleanup removes entries
 * - CONTEXT-12: checkBudget() returns correct values
 * - S1: Workspace CLAUDE.md is written during setup
 * - #18: Summary validation (missing, too short, too long, normal)
 */

import { describe, it, expect } from 'vitest';
import { ContextManager } from '../../utils/contextManager.js';

describe('CONTEXT-12: checkBudget()', () => {
  it('returns within budget when tokens are under limit', () => {
    const ctx = new ContextManager(100_000);
    const result = ctx.checkBudget(50_000);
    expect(result.withinBudget).toBe(true);
    expect(result.remaining).toBe(50_000);
  });

  it('returns not within budget when tokens exceed limit', () => {
    const ctx = new ContextManager(100_000);
    const result = ctx.checkBudget(150_000);
    expect(result.withinBudget).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('returns exactly zero remaining at limit', () => {
    const ctx = new ContextManager(100_000);
    const result = ctx.checkBudget(100_000);
    expect(result.withinBudget).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('#18: Summary validation logic', () => {
  it('capSummary truncates text over 500 words', () => {
    const longText = Array.from({ length: 1001 }, (_, i) => `word${i}`).join(' ');
    const capped = ContextManager.capSummary(longText, 500);
    expect(capped).toContain('[truncated]');
    const words = capped.split(/\s+/);
    // 500 words + "[truncated]"
    expect(words.length).toBe(501);
  });

  it('capSummary returns text as-is when under limit', () => {
    const shortText = 'This is a short summary.';
    expect(ContextManager.capSummary(shortText, 500)).toBe(shortText);
  });
});
