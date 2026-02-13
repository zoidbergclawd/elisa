/** Express + WebSocket server -- thin composition root. */

import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { HardwareService } from './services/hardwareService.js';
import { SessionStore } from './services/sessionStore.js';
import { createSessionRouter } from './routes/sessions.js';
import { createHardwareRouter } from './routes/hardware.js';
import { createSkillRouter } from './routes/skills.js';
import { createWorkspaceRouter } from './routes/workspace.js';

// -- State --

const store = new SessionStore();
const hardwareService = new HardwareService();

// -- Health --

interface HealthStatus {
  apiKey: 'valid' | 'invalid' | 'missing' | 'unchecked';
  apiKeyError?: string;
  agentSdk: 'available' | 'not_found';
}

const healthStatus: HealthStatus = {
  apiKey: 'unchecked',
  agentSdk: 'not_found',
};

async function validateStartupHealth(): Promise<void> {
  // Check Agent SDK
  try {
    await import('@anthropic-ai/claude-agent-sdk');
    healthStatus.agentSdk = 'available';
  } catch {
    healthStatus.agentSdk = 'not_found';
  }

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    healthStatus.apiKey = 'missing';
    return;
  }

  try {
    await new Anthropic().models.list({ limit: 1 });
    healthStatus.apiKey = 'valid';
  } catch (err: any) {
    healthStatus.apiKey = 'invalid';
    healthStatus.apiKeyError = err.message ?? String(err);
  }
}

// -- WebSocket Connection Manager --

class ConnectionManager {
  private connections = new Map<string, Set<WebSocket>>();

  connect(sessionId: string, ws: WebSocket): void {
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(ws);
  }

  disconnect(sessionId: string, ws: WebSocket): void {
    this.connections.get(sessionId)?.delete(ws);
  }

  async sendEvent(sessionId: string, event: Record<string, any>): Promise<void> {
    const conns = this.connections.get(sessionId);
    if (!conns) return;
    const data = JSON.stringify(event);
    for (const ws of conns) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      } catch {
        // ignore send errors
      }
    }
  }
}

const manager = new ConnectionManager();

// -- Express App --

function createApp(staticDir?: string) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // CORS: only needed in dev mode (frontend on separate origin)
  if (!staticDir) {
    const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', corsOrigin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', '*');
      res.header('Access-Control-Allow-Headers', '*');
      next();
    });
  }

  // Health
  app.get('/api/health', (_req, res) => {
    const ready = healthStatus.apiKey === 'valid' && healthStatus.agentSdk === 'available';
    res.json({
      status: ready ? 'ready' : 'degraded',
      apiKey: healthStatus.apiKey,
      apiKeyError: healthStatus.apiKeyError ? 'API key validation failed' : undefined,
      agentSdk: healthStatus.agentSdk,
    });
  });

  // Route modules
  const sendEvent = (sessionId: string, event: Record<string, any>) =>
    manager.sendEvent(sessionId, event);

  app.use('/api/sessions', createSessionRouter({ store, sendEvent, hardwareService }));
  app.use('/api/skills', createSkillRouter({ store, sendEvent }));
  app.use('/api/hardware', createHardwareRouter({ store, hardwareService }));
  app.use('/api/workspace', createWorkspaceRouter());

  // Templates
  app.get('/api/templates', (_req, res) => {
    res.json([]);
  });

  // Portal setup: analyze description and suggest config
  app.post('/api/portals/setup', async (req, res) => {
    const { description, mechanism } = req.body;
    if (!description) {
      res.status(400).json({ detail: 'description is required' });
      return;
    }
    const suggested: Record<string, any> = {
      name: description.slice(0, 40),
      description,
      mechanism: mechanism ?? 'auto',
      capabilities: [],
    };
    res.json(suggested);
  });

  // Portal test: test a portal connection
  app.post('/api/portals/:id/test', async (req, res) => {
    const { mechanism, serialConfig } = req.body;
    if (mechanism === 'serial') {
      const board = await hardwareService.detectBoard();
      if (board) {
        res.json({ success: true, message: `Board detected: ${board.boardType} on ${board.port}` });
      } else {
        res.json({ success: false, message: 'No board detected. Connect via USB and try again.' });
      }
    } else {
      res.json({ success: true, message: 'Connection test not yet implemented for this mechanism.' });
    }
  });

  // -- Static file serving (production: Electron serves frontend) --

  if (staticDir) {
    app.use(express.static(staticDir));
    // SPA fallback: non-API routes return index.html
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}

// -- Server Startup --

/**
 * Start the Express + WebSocket server.
 * @param port - Port to listen on
 * @param staticDir - If provided, serve frontend static files from this directory
 * @returns Promise that resolves with the HTTP server instance
 */
export function startServer(
  port: number,
  staticDir?: string,
): Promise<http.Server> {
  const app = createApp(staticDir);
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrades on /ws/session/:id
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);
    const match = url.pathname.match(/^\/ws\/session\/(.+)$/);
    if (!match) {
      socket.destroy();
      return;
    }

    const sessionId = match[1];
    if (!store.has(sessionId)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      manager.connect(sessionId, ws);
      ws.on('close', () => manager.disconnect(sessionId, ws));
      ws.on('message', () => {
        // Client keepalive; ignore content
      });
    });
  });

  // Graceful shutdown handler
  function gracefulShutdown(signal: string) {
    console.log(`Received ${signal}, shutting down gracefully...`);

    // Cancel all running orchestrators
    store.cancelAll();

    // Close WebSocket server
    wss.close();

    // Close HTTP server with a 10s force-exit
    server.close(() => {
      console.log('Server closed');
    });

    setTimeout(() => {
      console.warn('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Prune stale sessions every 10 minutes
  const pruneInterval = setInterval(() => {
    const pruned = store.pruneStale();
    if (pruned.length > 0) {
      console.log(`Pruned ${pruned.length} stale session(s): ${pruned.join(', ')}`);
    }
  }, 600_000);
  pruneInterval.unref();

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      console.log(`Elisa backend listening on 127.0.0.1:${port}`);
      validateStartupHealth().then(() => {
        console.log(`Health: API key=${healthStatus.apiKey}, SDK=${healthStatus.agentSdk}`);
      });
      resolve(server);
    });
  });
}

// -- Direct execution (standalone / dev mode) --

const isDirectRun =
  !process.env.ELECTRON_RUN_AS_NODE &&
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`;

if (isDirectRun) {
  const port = Number(process.env.PORT ?? 8000);
  startServer(port).catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}
