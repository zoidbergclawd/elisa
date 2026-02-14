import { describe, it, expect, vi } from 'vitest';
import { findFreePort } from './findFreePort.js';

describe('findFreePort', () => {
  it('resolves a valid port number', async () => {
    const port = await findFreePort(3000);
    expect(port).toBeGreaterThanOrEqual(3000);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('rejects when no port is available', async () => {
    // Start above valid range so the first check triggers rejection
    await expect(findFreePort(65536)).rejects.toThrow('No free port found');
  });
});
