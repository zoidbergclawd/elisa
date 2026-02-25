import http from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerInfo {
  server: http.Server;
  authToken: string;
  port: number;
}

export async function startHeadlessServer(): Promise<ServerInfo> {
  // Resolve paths relative to this file's location, then convert to file:// URLs
  // for cross-platform dynamic import. Using variables prevents tsc from following
  // into the backend source tree (which is outside our rootDir).
  const serverPath = pathToFileURL(resolve(__dirname, '../../backend/src/server.js')).href;
  const portPath = pathToFileURL(resolve(__dirname, '../../backend/src/utils/findFreePort.js')).href;

  const { startServer } = await (import(serverPath) as Promise<{
    startServer: (port: number, staticDir?: string) => Promise<{ server: http.Server; authToken: string }>;
  }>);
  const { findFreePort } = await (import(portPath) as Promise<{
    findFreePort: (startPort: number) => Promise<number>;
  }>);

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
