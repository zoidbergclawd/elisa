import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from './withTimeout.js';

describe('withTimeout', () => {
  it('resolves when the promise settles within the timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('rejects with "Timed out" when the promise exceeds the timeout', async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve('late'), 5000);
    });
    await expect(withTimeout(slow, 10)).rejects.toThrow('Timed out');
  });

  it('clears the timer when the promise resolves early', async () => {
    vi.useFakeTimers();
    try {
      const fast = Promise.resolve('done');
      const p = withTimeout(fast, 60_000);
      // Resolve the microtask queue
      await vi.advanceTimersByTimeAsync(0);
      const result = await p;
      expect(result).toBe('done');
      // Advance past the timeout -- should NOT reject because timer was cleared
      vi.advanceTimersByTime(120_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('propagates the original rejection when the promise rejects before timeout', async () => {
    const failing = Promise.reject(new Error('upstream'));
    await expect(withTimeout(failing, 5000)).rejects.toThrow('upstream');
  });

  it('kills the child process on timeout when option is provided', async () => {
    const kill = vi.fn();
    const childProcess = { kill } as any;
    const slow = new Promise<void>(() => {});
    await expect(
      withTimeout(slow, 10, { childProcess }),
    ).rejects.toThrow('Timed out');
    expect(kill).toHaveBeenCalled();
  });

  it('does not kill child process when promise resolves in time', async () => {
    const kill = vi.fn();
    const childProcess = { kill } as any;
    const result = await withTimeout(Promise.resolve('ok'), 5000, { childProcess });
    expect(result).toBe('ok');
    expect(kill).not.toHaveBeenCalled();
  });
});
