import http from 'node:http';

export interface ServerInfo {
  server: http.Server;
  authToken: string;
  port: number;
}

export async function startHeadlessServer(): Promise<ServerInfo> {
  // Import the backend's startServer dynamically
  const { startServer } = await import('../../backend/src/server.js');
  const { findFreePort } = await import('../../backend/src/utils/findFreePort.js');

  const port = await findFreePort(9100); // Start above default 8000 to avoid conflicts
  const { server, authToken } = await startServer(port);

  return { server, authToken, port };
}

export async function stopServer(server: http.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
