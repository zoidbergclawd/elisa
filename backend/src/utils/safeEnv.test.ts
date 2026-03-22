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

  it('injects ELECTRON_RUN_AS_NODE when node shim is active', () => {
    const orig = process.env.ELISA_USE_NODE_SHIM;
    process.env.ELISA_USE_NODE_SHIM = '1';
    try {
      const env = safeEnv();
      expect(env.ELECTRON_RUN_AS_NODE).toBe('1');
    } finally {
      if (orig === undefined) delete process.env.ELISA_USE_NODE_SHIM;
      else process.env.ELISA_USE_NODE_SHIM = orig;
    }
  });

  it('does not inject ELECTRON_RUN_AS_NODE when system node is used', () => {
    const orig = process.env.ELISA_USE_NODE_SHIM;
    delete process.env.ELISA_USE_NODE_SHIM;
    try {
      const env = safeEnv();
      expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    } finally {
      if (orig !== undefined) process.env.ELISA_USE_NODE_SHIM = orig;
    }
  });
});
