/** Scans for an available TCP port starting from the given port number. */

import net from 'node:net';

export function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryNext = (): void => {
      if (port > 65535) {
        reject(new Error('No free port found'));
        return;
      }
      const server = net.createServer();
      server.listen(port, () => {
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
