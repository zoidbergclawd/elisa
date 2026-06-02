import { describe, it, expect } from 'vitest';
import net from 'node:net';
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

  // Regression: findFreePort must probe the same interface (127.0.0.1) that our
  // static/preview servers bind to. Probing 0.0.0.0/:: reported a port as free
  // even when 127.0.0.1:PORT was taken, causing a later EADDRINUSE -> 500.
  it('skips a port already bound on 127.0.0.1', async () => {
    const taken = await findFreePort(3000);
    const occupant = net.createServer();
    await new Promise<void>((resolve) => occupant.listen(taken, '127.0.0.1', resolve));
    try {
      const next = await findFreePort(taken);
      expect(next).not.toBe(taken);
      expect(next).toBeGreaterThan(taken);
    } finally {
      await new Promise<void>((resolve) => occupant.close(() => resolve()));
    }
  });
});
