import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODEL,
  AGENT_TIMEOUT_SECONDS,
  MAX_CONCURRENT_TASKS,
  TEST_TIMEOUT_MS,
  BUILD_TIMEOUT_MS,
  FLASH_TIMEOUT_MS,
  NARRATOR_TIMEOUT_MS,
  RATE_LIMIT_DELAY_MS,
  CLEANUP_DELAY_MS,
  SESSION_MAX_AGE_MS,
  PRUNE_INTERVAL_MS,
  PREDECESSOR_WORD_CAP,
  DEFAULT_TOKEN_BUDGET,
  MEETING_AGENT_TIMEOUT_MS,
} from './constants.js';

describe('constants', () => {
  it('DEFAULT_MODEL is a non-empty string', () => {
    expect(typeof DEFAULT_MODEL).toBe('string');
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0);
  });

  it('all timeout constants are positive numbers', () => {
    const timeouts = [
      AGENT_TIMEOUT_SECONDS,
      TEST_TIMEOUT_MS,
      BUILD_TIMEOUT_MS,
      FLASH_TIMEOUT_MS,
      NARRATOR_TIMEOUT_MS,
      RATE_LIMIT_DELAY_MS,
      CLEANUP_DELAY_MS,
      SESSION_MAX_AGE_MS,
      PRUNE_INTERVAL_MS,
    ];
    for (const val of timeouts) {
      expect(typeof val).toBe('number');
      expect(val).toBeGreaterThan(0);
    }
  });

  it('MAX_CONCURRENT_TASKS is at least 1', () => {
    expect(MAX_CONCURRENT_TASKS).toBeGreaterThanOrEqual(1);
  });

  it('PREDECESSOR_WORD_CAP is a positive number', () => {
    expect(PREDECESSOR_WORD_CAP).toBeGreaterThan(0);
  });

  it('DEFAULT_TOKEN_BUDGET matches tokenTracker export', () => {
    expect(DEFAULT_TOKEN_BUDGET).toBe(500_000);
  });

  it('MEETING_AGENT_TIMEOUT_MS is 15 seconds (P2 #19 regression)', () => {
    expect(MEETING_AGENT_TIMEOUT_MS).toBe(15_000);
  });
});
