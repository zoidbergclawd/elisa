/** Express + WebSocket server -- thin composition root. */

import 'dotenv/config';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
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
import { DeviceRegistry } from './services/deviceRegistry.js';
import { createDeviceRouter } from './routes/devices.js';
import { MeetingRegistry } from './services/meetingRegistry.js';
import { MeetingService } from './services/meetingService.js';
import { createMeetingRouter } from './routes/meetings.js';
import { AgentStore } from './services/runtime/agentStore.js';
import { ConversationManager } from './services/runtime/conversationManager.js';
import { ConsentManager } from './services/runtime/consentManager.js';
import { TurnPipeline } from './services/runtime/turnPipeline.js';
import { KnowledgeBackpack } from './services/runtime/knowledgeBackpack.js';
import { StudyMode } from './services/runtime/studyMode.js';
import { GapDetector } from './services/runtime/gapDetector.js';
import { LocalRuntimeProvisioner } from './services/runtimeProvisioner.js';
import { createRuntimeRouter } from './routes/runtime.js';
import { SpecGraphService } from './services/specGraph.js';
import { createSpecGraphRouter } from './routes/specGraph.js';
import { getAnthropicClient } from './utils/anthropicClient.js';
import type { WSEvent } from './services/phases/types.js';

// -- State --

const store = new SessionStore();
const hardwareService = new HardwareService();
const deviceRegistry = new DeviceRegistry(path.resolve(import.meta.dirname, '../../devices'));
const meetingRegistry = new MeetingRegistry();
const meetingService = new MeetingService(meetingRegistry);

// Register default meeting types
meetingRegistry.register({
  id: 'debug-convergence',
  name: 'Bug Detective Meeting',
  agentName: 'Bug Detective',
  canvasType: 'bug-detective',
  triggerConditions: [{ event: 'convergence_stalled' }],
  persona: 'A friendly debugging expert who helps kids figure out why code is not working. Patient, curious, and encouraging.',
});

// Register Art Agent meeting type (BOX-3 theme customization)
import { registerArtAgentMeeting } from './services/artAgentMeeting.js';
registerArtAgentMeeting(meetingRegistry);

// Register Documentation Agent meeting type (post-build documentation)
import { registerDocAgentMeeting } from './services/docAgentMeeting.js';
registerDocAgentMeeting(meetingRegistry);

// Register Web Designer Agent meeting type (web deploy launch pages)
import { registerWebDesignAgentMeeting } from './services/webDesignAgentMeeting.js';
registerWebDesignAgentMeeting(meetingRegistry);

// Register Media Agent meeting type (visual assets and marketing)
import { registerMediaAgentMeeting } from './services/mediaAgentMeeting.js';
registerMediaAgentMeeting(meetingRegistry);

// Register Architecture Agent meeting type (system understanding capstone)
import { registerArchitectureAgentMeeting } from './services/architectureAgentMeeting.js';
registerArchitectureAgentMeeting(meetingRegistry);

// Register Integration Agent meeting type (cross-nugget composition)
import { registerIntegrationAgentMeeting } from './services/integrationAgentMeeting.js';
registerIntegrationAgentMeeting(meetingRegistry);

// Spec Graph
const specGraphService = new SpecGraphService();

// Composition Service (cross-nugget composition + impact detection)
import { CompositionService } from './services/compositionService.js';
const compositionService = new CompositionService(specGraphService);

// Agent Runtime (PRD-001)
const agentStore = new AgentStore();
const consentManager = new ConsentManager();
const conversationManager = new ConversationManager(undefined, consentManager);
const knowledgeBackpack = new KnowledgeBackpack();
const studyMode = new StudyMode(knowledgeBackpack);
const gapDetector = new GapDetector();
const runtimeProvisioner = new LocalRuntimeProvisioner(agentStore);
const turnPipeline = new TurnPipeline({
  agentStore,
  conversationManager,
  getClient: getAnthropicClient,
  knowledgeBackpack,
  consentManager,
  gapDetector,
});

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
  } catch (err: unknown) {
    healthStatus.apiKey = 'invalid';
    healthStatus.apiKeyError = err instanceof Error ? err.message : String(err);
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

  async sendEvent(sessionId: string, event: WSEvent): Promise<void> {
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

  cleanup(sessionId: string): void {
    const conns = this.connections.get(sessionId);
    if (conns) {
      for (const ws of conns) {
        try { ws.close(); } catch { /* ignore */ }
      }
      this.connections.delete(sessionId);
    }
  }
}

const manager = new ConnectionManager();

// Wire up WebSocket + meeting cleanup when sessions are removed
store.onCleanup = (sessionId: string) => {
  manager.cleanup(sessionId);
  meetingService.cleanupSession(sessionId);
};

// -- Express App --

function createApp(staticDir?: string, authToken?: string) {
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

  // Health (no auth required)
  app.get('/api/health', async (_req, res) => {
    // Live-check API key presence (env var may be set after startup via config endpoint)
    if (!process.env.ANTHROPIC_API_KEY) {
      healthStatus.apiKey = 'missing';
      healthStatus.apiKeyError = undefined;
    } else if (healthStatus.apiKey === 'missing' || healthStatus.apiKey === 'unchecked') {
      // Key appeared since last check — validate with Anthropic API
      try {
        await new Anthropic().models.list({ limit: 1 });
        healthStatus.apiKey = 'valid';
        healthStatus.apiKeyError = undefined;
      } catch (err: unknown) {
        healthStatus.apiKey = 'invalid';
        healthStatus.apiKeyError = err instanceof Error ? err.message : String(err);
      }
    }

    const ready = healthStatus.apiKey === 'valid' && healthStatus.agentSdk === 'available';
    res.json({
      status: ready ? 'ready' : 'degraded',
      apiKey: healthStatus.apiKey,
      apiKeyError: healthStatus.apiKeyError ? 'API key validation failed' : undefined,
      agentSdk: healthStatus.agentSdk,
    });
  });

  // Auth middleware for all other /api/* routes
  if (authToken) {
    app.use('/api', (req, res, next) => {
      if (req.method === 'OPTIONS') { next(); return; }
      const header = req.headers.authorization;
      if (!header || header !== `Bearer ${authToken}`) {
        res.status(401).json({ detail: 'Unauthorized' });
        return;
      }
      next();
    });
  }

  // Dev-mode: accept API key from Electron process (which stores it encrypted)
  if (!staticDir) {
    app.post('/api/internal/config', async (req, res) => {
      const { apiKey } = req.body;
      if (typeof apiKey !== 'string' || apiKey.length === 0) {
        res.status(400).json({ detail: 'apiKey is required' });
        return;
      }
      process.env.ANTHROPIC_API_KEY = apiKey;
      // Validate the newly-set key
      try {
        await new Anthropic().models.list({ limit: 1 });
        healthStatus.apiKey = 'valid';
        healthStatus.apiKeyError = undefined;
      } catch (err: unknown) {
        healthStatus.apiKey = 'invalid';
        healthStatus.apiKeyError = err instanceof Error ? err.message : String(err);
      }
      res.json({ apiKey: healthStatus.apiKey });
    });
  }

  // Route modules
  const sendEvent = (sessionId: string, event: WSEvent) =>
    manager.sendEvent(sessionId, event);

  app.use('/api/sessions', createSessionRouter({ store, sendEvent, hardwareService, deviceRegistry, meetingRegistry, meetingService, runtimeProvisioner, specGraphService }));
  app.use('/api/skills', createSkillRouter({ store, sendEvent }));
  app.use('/api/hardware', createHardwareRouter({ store, hardwareService }));
  app.use('/api/workspace', createWorkspaceRouter());
  app.use('/api/devices', createDeviceRouter({ registry: deviceRegistry }));
  app.use('/api/sessions/:sessionId/meetings', createMeetingRouter({ store, meetingService, sendEvent }));
  app.use('/api/spec-graph', createSpecGraphRouter({ specGraphService, compositionService, sendEvent }));

  // Agent Runtime (PRD-001) — mounted at /v1/* with its own api-key auth
  app.use('/v1', createRuntimeRouter({ agentStore, conversationManager, turnPipeline, knowledgeBackpack, studyMode, gapDetector }));

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
    const suggested = {
      name: (description as string).slice(0, 40),
      description,
      mechanism: mechanism ?? 'auto',
      capabilities: [] as string[],
    };
    res.json(suggested);
  });

  // Portal test: test a portal connection
  app.post('/api/portals/:id/test', async (req, res) => {
    res.json({ success: true, message: 'Connection test not yet implemented for this mechanism.' });
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
 * @param authToken - If provided, use as the auth token; otherwise generate one
 * @returns Promise that resolves with the HTTP server and auth token
 */
export function startServer(
  port: number,
  staticDir?: string,
  authToken?: string,
): Promise<{ server: http.Server; authToken: string }> {
  const token = authToken ?? randomUUID();
  const app = createApp(staticDir, token);
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // WebSocket server for Agent Runtime streaming (/v1/agents/:id/stream)
  const runtimeWss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrades
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`);

    // ── Build session WebSocket: /ws/session/:id ──────────────────────
    const sessionMatch = url.pathname.match(/^\/ws\/session\/(.+)$/);
    if (sessionMatch) {
      const wsToken = url.searchParams.get('token');
      if (wsToken !== token) {
        socket.destroy();
        return;
      }

      const sessionId = sessionMatch[1];
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
      return;
    }

    // ── Agent Runtime streaming: /v1/agents/:id/stream ────────────────
    const agentMatch = url.pathname.match(/^\/v1\/agents\/([^/]+)\/stream$/);
    if (agentMatch) {
      const wsAgentId = agentMatch[1];
      const apiKey = url.searchParams.get('api_key');

      if (!apiKey || !agentStore.validateApiKey(wsAgentId, apiKey)) {
        socket.destroy();
        return;
      }

      runtimeWss.handleUpgrade(request, socket, head, (ws) => {
        ws.on('message', async (raw) => {
          try {
            const msg = JSON.parse(String(raw));
            if (msg.type !== 'turn' || !msg.text) {
              ws.send(JSON.stringify({ type: 'error', detail: 'Expected { type: "turn", text: string, session_id?: string }' }));
              return;
            }

            for await (const chunk of turnPipeline.receiveStreamingTurn(wsAgentId, {
              text: msg.text,
              session_id: msg.session_id,
            })) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(chunk));
              }
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', detail: message }));
            }
          }
        });

        // Send ready signal
        ws.send(JSON.stringify({ type: 'connected', agent_id: wsAgentId }));
      });
      return;
    }

    // Unknown WebSocket path
    socket.destroy();
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
      console.log(`Auth token: ${token}`);
      validateStartupHealth().then(() => {
        console.log(`Health: API key=${healthStatus.apiKey}, SDK=${healthStatus.agentSdk}`);
      });
      resolve({ server, authToken: token });
    });
  });
}

// -- Direct execution (standalone / dev mode) --

const isDirectRun =
  !process.env.ELECTRON_RUN_AS_NODE &&
  import.meta.url.toLowerCase() === pathToFileURL(process.argv[1] ?? '').href.toLowerCase();

if (isDirectRun) {
  const port = Number(process.env.PORT ?? 8000);
  const devToken = process.env.ELISA_AUTH_TOKEN ?? 'dev-token';
  startServer(port, undefined, devToken).then(({ authToken: t }) => {
    console.log(`Dev auth token: ${t}`);
  }).catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}
