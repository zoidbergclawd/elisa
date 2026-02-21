#!/usr/bin/env node
/**
 * Multi-instance dev launcher.
 * Finds free ports for backend and frontend, then starts all three
 * processes (backend, Vite, Electron) via direct spawning.
 *
 * Supports running multiple Elisa instances simultaneously -- each gets
 * its own backend, frontend, and Electron window on separate ports.
 */
import net from 'node:net';
import { execSync, spawn } from 'node:child_process';

/** Check if a port is in use by attempting a TCP connection. */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: 'localhost' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { resolve(false); });
  });
}

/** Find the first free port starting from startPort. */
async function findFreePort(startPort) {
  let port = startPort;
  while (port <= 65535) {
    if (!(await isPortInUse(port))) return port;
    port++;
  }
  throw new Error('No free port found');
}

// Build electron TypeScript
console.log('Building Electron...');
execSync('npm run build:electron', { stdio: 'inherit' });

// Find free ports (backend starting at 8000, frontend starting at 5173)
const backendPort = await findFreePort(8000);
const frontendPort = await findFreePort(5173);
console.log(`Launching: backend=:${backendPort}  frontend=:${frontendPort}`);

// Env vars inherited by all child processes
const env = {
  ...process.env,
  PORT: String(backendPort),
  CORS_ORIGIN: `http://localhost:${frontendPort}`,
  ELISA_BACKEND_PORT: String(backendPort),
  ELISA_FRONTEND_PORT: String(frontendPort),
};

// Use a unique Electron instance suffix when not on default ports,
// so multiple Electron windows don't fight over the GPU cache.
if (backendPort !== 8000 || frontendPort !== 5173) {
  env.ELISA_INSTANCE_ID = `${backendPort}`;
}

const children = [];

// Backend
const backend = spawn('npx', ['tsx', 'src/server.ts'], {
  cwd: 'backend',
  env,
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: true,
});
children.push(backend);

// Frontend (Vite) -- use strictPort so it doesn't silently pick a different port
const frontend = spawn('npx', ['vite', '--port', String(frontendPort), '--strictPort'], {
  cwd: 'frontend',
  env,
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: true,
});
children.push(frontend);

// Poll for frontend readiness, then launch Electron
async function waitForUrl(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

console.log(`Waiting for frontend on :${frontendPort}...`);
await waitForUrl(`http://localhost:${frontendPort}`);
console.log('Frontend ready, launching Electron...');

const electron = spawn('npx', ['electron', '.'], {
  env,
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: true,
});
children.push(electron);

// If any process exits, kill the others
function cleanup(code) {
  for (const child of children) {
    try { child.kill(); } catch { /* ignore */ }
  }
  process.exit(code ?? 0);
}

for (const child of children) {
  child.on('exit', cleanup);
}

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));
