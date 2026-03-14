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
import { MeetingAgentService } from './services/meetingAgentService.js';
import { createMeetingRouter } from './routes/meetings.js';
import { AgentStore } from './services/runtime/agentStore.js';
import { ConversationManager } from './services/runtime/conversationManager.js';
import { ConsentManager } from './services/runtime/consentManager.js';
import { TurnPipeline } from './services/runtime/turnPipeline.js';
import { AudioPipeline } from './services/runtime/audioPipeline.js';
import { KnowledgeBackpack } from './services/runtime/knowledgeBackpack.js';
import { StudyMode } from './services/runtime/studyMode.js';
import { GapDetector } from './services/runtime/gapDetector.js';
import { LocalRuntimeProvisioner } from './services/runtimeProvisioner.js';
import { createRuntimeRouter } from './routes/runtime.js';
import { SpecGraphService } from './services/specGraph.js';
import { createSpecGraphRouter } from './routes/specGraph.js';
import { getAnthropicClient } from './utils/anthropicClient.js';
import { getLanUrl } from './utils/lanUrl.js';
import { getDevicesDir } from './utils/resourcePath.js';
import { WS_PING_INTERVAL_MS } from './utils/constants.js';
import type { WSEvent } from './services/phases/types.js';

const wsAlive = new WeakMap<WebSocket, boolean>();

/** Per-connection diagnostics metadata for debugging disconnects. */
interface WsConnectionMeta {
  connectedAt: number;
  sessionId: string;
  lastPongAt: number;
  pingsSent: number;
  pongsReceived: number;
  lastEventType: string;
}
const wsMeta = new WeakMap<WebSocket, WsConnectionMeta>();

// -- State --

const store = new SessionStore();
const hardwareService = new HardwareService();
const deviceRegistry = new DeviceRegistry(getDevicesDir());
const meetingRegistry = new MeetingRegistry();
const meetingService = new MeetingService(meetingRegistry);
const meetingAgentService = new MeetingAgentService();

// Register default meeting types
meetingRegistry.register({
  id: 'debug-convergence',
  name: 'Bug Detective Meeting',
  agentName: 'Bug Detective',
  canvasType: 'bug-detective',
  triggerConditions: [{ event: 'convergence_stalled' }],
  persona: 'A friendly debugging expert who helps kids figure out why code is not working. Patient, curious, and encouraging.',
});

// Register Buddy Agent meeting type (mid-build check-in)
import { registerBuddyAgentMeeting } from './services/buddyAgentMeeting.js';
registerBuddyAgentMeeting(meetingRegistry);

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

// Register Social Media Agent meeting type (social media campaigns)
import { registerSocialMediaAgentMeeting } from './services/socialMediaAgentMeeting.js';
registerSocialMediaAgentMeeting(meetingRegistry);

// Register Architecture Agent meeting type (system understanding capstone)
import { registerArchitectureAgentMeeting } from './services/architectureAgentMeeting.js';
registerArchitectureAgentMeeting(meetingRegistry);

// Register Integration Agent meeting type (cross-nugget composition)
import { registerIntegrationAgentMeeting } from './services/integrationAgentMeeting.js';
registerIntegrationAgentMeeting(meetingRegistry);

// Register task-level meeting types (design review before art tasks)
import { registerTaskMeetingTypes } from './services/taskMeetingTypes.js';
registerTaskMeetingTypes(meetingRegistry);

// Spec Graph
const specGraphService = new SpecGraphService();

// Composition Service (cross-nugget composition + impact detection)
import { CompositionService } from './services/compositionService.js';
const compositionService = new CompositionService(specGraphService);

// Agent Runtime (PRD-001)
// Use LAN IP for runtime URL so ESP32 devices can reach us over WiFi.
// Falls back to localhost for browser-only usage.
// Supports RUNTIME_URL env var override for manual configuration.
const lanRuntimeUrl = getLanUrl(Number(process.env.PORT ?? 8000));
const agentStore = new AgentStore(lanRuntimeUrl);
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
const audioPipeline = new AudioPipeline(turnPipeline, agentStore);

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
  // Per-session send queue: serializes all ws.send() calls
  private sendQueues = new Map<string, Array<{ data: string; eventType: string; resolve: () => void }>>();
  private draining = new Map<string, boolean>();

  connect(sessionId: string, ws: WebSocket): void {
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(ws);
    console.log(`[ws] connect session=${sessionId} total=${this.connections.get(sessionId)!.size}`);
  }

  disconnect(sessionId: string, ws: WebSocket): void {
    const code = (ws as any)._closeCode ?? 'unknown';
    const reason = (ws as any)._closeReason ?? '';
    console.log(`[ws] disconnect session=${sessionId} code=${code} reason="${reason}"`);
    this.connections.get(sessionId)?.delete(ws);
  }

  /** Returns true if the session has at least one active WebSocket connection. */
  hasConnections(sessionId: string): boolean {
    const conns = this.connections.get(sessionId);
    return !!conns && conns.size > 0;
  }

  async sendEvent(sessionId: string, event: WSEvent): Promise<void> {
    const conns = this.connections.get(sessionId);
    if (!conns || conns.size === 0) return;

    const data = JSON.stringify(event);

    return new Promise<void>((resolve) => {
      let queue = this.sendQueues.get(sessionId);
      if (!queue) {
        queue = [];
        this.sendQueues.set(sessionId, queue);
      }
      queue.push({ data, eventType: event.type, resolve });

      if (queue.length === 10 || queue.length === 50 || queue.length === 100) {
        console.warn(`[ws-queue] depth=${queue.length} session=${sessionId} latest=${event.type}`);
      }

      if (!this.draining.get(sessionId)) {
        this.drainQueue(sessionId);
      }
    });
  }

  private drainQueue(sessionId: string): void {
    this.draining.set(sessionId, true);
    const startTime = Date.now();
    let count = 0;

    const drainNext = () => {
      const queue = this.sendQueues.get(sessionId);
      if (!queue || queue.length === 0) {
        this.draining.set(sessionId, false);
        if (count > 5) {
          console.log(`[ws-queue] drained session=${sessionId} sent=${count} elapsed=${Date.now() - startTime}ms`);
        }
        return;
      }

      const { data, eventType, resolve } = queue.shift()!;
      const conns = this.connections.get(sessionId);

      if (conns) {
        for (const ws of conns) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data);
              const meta = wsMeta.get(ws);
              if (meta) meta.lastEventType = eventType;
            } else if (eventType.startsWith('meeting_')) {
              console.warn(`[ws] dropped ${eventType} for session=${sessionId} (readyState=${ws.readyState})`);
            }
          } catch {
            // ignore send errors
          }
        }
      }

      count++;
      resolve();

      // Yield to event loop before next frame so proxy can forward
      setImmediate(drainNext);
    };

    // First frame sends immediately (no yield)
    drainNext();
  }

  cleanup(sessionId: string): void {
    // Resolve pending promises so callers don't hang
    const queue = this.sendQueues.get(sessionId);
    if (queue) {
      for (const entry of queue) entry.resolve();
      this.sendQueues.delete(sessionId);
    }
    this.draining.delete(sessionId);

    const conns = this.connections.get(sessionId);
    if (conns) {
      for (const ws of conns) {
        try { ws.close(); } catch { /* ignore */ }
      }
      this.connections.delete(sessionId);
    }
  }

  *allConnections(): IterableIterator<WebSocket> {
    for (const conns of this.connections.values()) {
      for (const ws of conns) yield ws;
    }
  }
}

const manager = new ConnectionManager();
const runtimeConnections = new Set<WebSocket>();

// Allow session store to check for active WS connections (used by pruneStale)
store.isConnected = (sessionId: string) => manager.hasConnections(sessionId);

// Wire up WebSocket + meeting cleanup when sessions are removed
store.onCleanup = (sessionId: string) => {
  // Send meeting_ended for any pending invites/active meetings before closing connections
  const sendForSession = (event: WSEvent) => manager.sendEvent(sessionId, event);
  meetingService.cleanupSession(sessionId, sendForSession)
    .catch(() => { /* ignore */ })
    .finally(() => { manager.cleanup(sessionId); });
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
  app.use('/api/sessions/:sessionId/meetings', createMeetingRouter({ store, meetingService, meetingAgentService, sendEvent }));
  app.use('/api/spec-graph', createSpecGraphRouter({ specGraphService, compositionService, sendEvent }));

  // Agent Runtime (PRD-001) — mounted at /v1/* with its own api-key auth
  app.use('/v1', createRuntimeRouter({ agentStore, conversationManager, turnPipeline, audioPipeline, knowledgeBackpack, studyMode, gapDetector }));

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

  // WS diagnostic endpoint: called by frontend when WS connection fails
  app.get('/api/debug/ws-diag', (req, res) => {
    const sessionId = req.query.session_id as string | undefined;
    const tokenPrefix = req.query.token_prefix as string | undefined;
    res.json({
      sessionExists: sessionId ? store.has(sessionId) : null,
      tokenMatch: tokenPrefix ? token.startsWith(tokenPrefix) : null,
      serverTokenPrefix: token.slice(0, 8),
      storeSize: store.size,
      hasConnections: sessionId ? manager.hasConnections(sessionId) : null,
    });
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
        console.warn(`[ws] upgrade rejected: bad token for session=${sessionMatch[1]} (got=${wsToken?.slice(0, 8)}… want=${token.slice(0, 8)}…)`);
        socket.write('HTTP/1.1 401 Unauthorized\r\nX-WS-Reject: bad-token\r\n\r\n');
        socket.destroy();
        return;
      }

      const sessionId = sessionMatch[1];
      if (!store.has(sessionId)) {
        console.warn(`[ws] upgrade rejected: session not found id=${sessionId} (store.size=${store.size})`);
        socket.write('HTTP/1.1 404 Not Found\r\nX-WS-Reject: session-not-found\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wsAlive.set(ws, true);
        const meta: WsConnectionMeta = {
          connectedAt: Date.now(),
          sessionId,
          lastPongAt: Date.now(),
          pingsSent: 0,
          pongsReceived: 0,
          lastEventType: '',
        };
        wsMeta.set(ws, meta);
        manager.connect(sessionId, ws);
        store.cancelCleanup(sessionId); // Session stays alive while a WS is connected
        // Clear socket-level timeout so Node doesn't close the underlying TCP socket
        (ws as any)._socket?.setTimeout?.(0);
        ws.on('pong', () => {
          wsAlive.set(ws, true);
          meta.pongsReceived++;
          meta.lastPongAt = Date.now();
        });
        ws.on('close', (code, reason) => {
          (ws as any)._closeCode = code;
          (ws as any)._closeReason = reason?.toString() ?? '';
          const age = ((Date.now() - meta.connectedAt) / 1000).toFixed(1);
          const pongRatio = meta.pingsSent > 0
            ? `${meta.pongsReceived}/${meta.pingsSent}`
            : 'n/a';
          const buffered = (ws as any).bufferedAmount ?? 0;
          console.log(
            `[ws] disconnect session=${sessionId} code=${code} reason="${reason?.toString() ?? ''}"` +
            ` age=${age}s pongs=${pongRatio} buffered=${buffered} lastEvent=${meta.lastEventType}`,
          );
          manager.disconnect(sessionId, ws);
          // Schedule cleanup when the last WS connection for this session drops
          if (!manager.hasConnections(sessionId) && store.has(sessionId)) {
            store.scheduleCleanup(sessionId);
          }
        });
        ws.on('error', (err) => {
          console.error(`[ws] error session=${sessionId}:`, err.message);
        });
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
        wsAlive.set(ws, true);
        runtimeConnections.add(ws);
        ws.on('close', () => { runtimeConnections.delete(ws); });
        ws.on('pong', () => { wsAlive.set(ws, true); });
        ws.on('message', async (raw) => {
          try {
            const msg = JSON.parse(String(raw));

            // ── Text turn ───────────────────────────────────────────
            if (msg.type === 'turn') {
              if (!msg.text) {
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
              return;
            }

            // ── Audio turn ──────────────────────────────────────────
            if (msg.type === 'audio_turn') {
              if (!audioPipeline || !audioPipeline.isAvailable()) {
                ws.send(JSON.stringify({ type: 'error', detail: 'Audio features require OPENAI_API_KEY environment variable' }));
                return;
              }

              if (!msg.audio_base64 || typeof msg.audio_base64 !== 'string') {
                ws.send(JSON.stringify({ type: 'error', detail: 'audio_base64 field is required' }));
                return;
              }

              const format = (msg.format === 'wav' || msg.format === 'webm') ? msg.format : 'webm';

              // Decode base64 audio
              let audioBuffer: Buffer;
              try {
                audioBuffer = Buffer.from(msg.audio_base64, 'base64');
              } catch {
                ws.send(JSON.stringify({ type: 'error', detail: 'Invalid base64 audio data' }));
                return;
              }

              if (audioBuffer.length === 0) {
                ws.send(JSON.stringify({ type: 'error', detail: 'Empty audio data' }));
                return;
              }

              // Send status events to drive face animation states
              const sendStatus = (status: string) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'audio_status', status }));
                }
              };

              sendStatus('transcribing');

              const result = await audioPipeline.processAudioTurn(
                wsAgentId,
                audioBuffer,
                format,
                msg.session_id,
              );

              sendStatus('thinking');
              sendStatus('speaking');

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'audio_response',
                  transcript: result.transcript,
                  response_text: result.response_text,
                  audio_base64: result.audio_base64,
                  audio_format: result.audio_format,
                  session_id: result.session_id,
                  usage: result.usage,
                }));
              }
              return;
            }

            // ── Unknown message type ────────────────────────────────
            ws.send(JSON.stringify({ type: 'error', detail: 'Unknown message type. Expected "turn" or "audio_turn"' }));
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

    // Stop heartbeat and close WebSocket servers
    clearInterval(heartbeatInterval);
    wss.close();
    runtimeWss.close();

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

  // Event loop lag monitor -- logs when the loop is blocked > 100ms
  let lastLagCheck = Date.now();
  const lagInterval = setInterval(() => {
    const now = Date.now();
    const lag = now - lastLagCheck - 2000; // expected interval is 2000ms
    lastLagCheck = now;
    if (lag > 100) {
      console.warn(`[diagnostics] Event loop lag: ${lag}ms`);
    }
  }, 2000);
  lagInterval.unref();

  // WebSocket heartbeat -- protocol-level pings keep connections alive through proxies
  const heartbeatInterval = setInterval(() => {
    for (const ws of manager.allConnections()) {
      if (wsAlive.get(ws) === false) {
        const meta = wsMeta.get(ws);
        const age = meta ? ((Date.now() - meta.connectedAt) / 1000).toFixed(1) : '?';
        console.warn(`[ws] heartbeat terminate session=${meta?.sessionId ?? '?'} age=${age}s (missed pong)`);
        ws.terminate();
        continue;
      }
      wsAlive.set(ws, false);
      const meta = wsMeta.get(ws);
      if (meta) meta.pingsSent++;
      ws.ping();
    }
    for (const ws of runtimeConnections) {
      if (wsAlive.get(ws) === false) { ws.terminate(); continue; }
      wsAlive.set(ws, false);
      ws.ping();
    }
  }, WS_PING_INTERVAL_MS);
  heartbeatInterval.unref();

  // Prune stale sessions every 10 minutes
  const pruneInterval = setInterval(() => {
    const pruned = store.pruneStale();
    if (pruned.length > 0) {
      console.log(`Pruned ${pruned.length} stale session(s): ${pruned.join(', ')}`);
    }
  }, 600_000);
  pruneInterval.unref();

  // Disable Node HTTP server timeouts so long-running builds aren't killed.
  // Node 24 defaults requestTimeout to 300s which can close idle WS connections.
  server.requestTimeout = 0;
  server.timeout = 0;

  return new Promise((resolve) => {
    const host = process.env.HOST ?? '127.0.0.1';
    server.listen(port, host, () => {
      console.log(`Elisa backend listening on ${host}:${port}`);
      console.log(`[ws] Server timeouts: requestTimeout=${server.requestTimeout} timeout=${server.timeout}`);
      if (process.env.NODE_ENV !== 'production') {
        console.log(`Auth token: ${token}`);
      }
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
    if (process.env.NODE_ENV !== 'production') {
      console.log(`Dev auth token: ${t}`);
    }
  }).catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}
