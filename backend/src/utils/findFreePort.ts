/** Scans for an available TCP port starting from the given port number. */

import net from 'node:net';

// Probe the same interface our servers actually bind to. Listening on the
// unspecified address (0.0.0.0/::) can report a port as free even when it is
// already in use on 127.0.0.1, leading to a later EADDRINUSE when the real
// server binds to 127.0.0.1 (see startStaticServer / deployPhase).
const PROBE_HOST = '127.0.0.1';

export function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryNext = (): void => {
      if (port > 65535) {
        reject(new Error('No free port found'));
        return;
      }
      const server = net.createServer();
      server.listen(port, PROBE_HOST, () => {
        const addr = server.address() as net.AddressInfo;
        server.close(() => resolve(addr.port));
      });
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          port++;
          tryNext();
        } else {
          reject(err);
        }
      });
    };
    tryNext();
  });
}
