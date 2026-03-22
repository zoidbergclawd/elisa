import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { safeEnv } from './safeEnv.js';

describe('safeEnv', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-1234';
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('returns env without ANTHROPIC_API_KEY', () => {
    const env = safeEnv();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('preserves other env vars', () => {
    const env = safeEnv();
    expect(env.PATH).toBe(process.env.PATH);
    expect(env.NODE_ENV).toBe(process.env.NODE_ENV);
  });

  it('does not mutate process.env', () => {
    safeEnv();
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-test-key-1234');
  });
});
