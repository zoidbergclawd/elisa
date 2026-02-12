/** Express + WebSocket server -- replaces FastAPI main.py. */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import archiver from 'archiver';
import Anthropic from '@anthropic-ai/sdk';
import type { BuildSession, SessionState } from './models/session.js';
import { Orchestrator } from './services/orchestrator.js';
import { HardwareService } from './services/hardwareService.js';
import { AgentRunner } from './services/agentRunner.js';
import { SkillRunner } from './services/skillRunner.js';

// -- State --

const sessions = new Map<string, BuildSession>();
const orchestrators = new Map<string, Orchestrator>();
const runningTasks = new Map<string, { cancel: () => void }>();
const skillRunners = new Map<string, SkillRunner>();
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
  app.use(express.json());

  // CORS: only needed in dev mode (frontend on separate origin)
  if (!staticDir) {
    app.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
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
      apiKeyError: healthStatus.apiKeyError,
      agentSdk: healthStatus.agentSdk,
    });
  });

  // Create session
  app.post('/api/sessions', (_req, res) => {
    const sessionId = randomUUID();
    sessions.set(sessionId, {
      id: sessionId,
      state: 'idle',
      spec: null,
      tasks: [],
      agents: [],
    });
    res.json({ session_id: sessionId });
  });

  // Get session
  app.get('/api/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) { res.status(404).json({ detail: 'Session not found' }); return; }
    res.json(session);
  });

  // Start session
  app.post('/api/sessions/:id/start', async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) { res.status(404).json({ detail: 'Session not found' }); return; }

    const spec = req.body.spec;
    session.state = 'planning';
    session.spec = spec;

    // Pre-execute composite skills: flatten them into simple agent skills
    if (spec.skills?.length) {
      const sendEvent = (evt: Record<string, any>) => manager.sendEvent(req.params.id, evt);
      const agentRunner = new AgentRunner();

      for (const skill of spec.skills) {
        if (skill.category === 'composite' && skill.workspace) {
          try {
            const runner = new SkillRunner(sendEvent, spec.skills, agentRunner);
            const plan = runner['interpretWorkspaceOnBackend'](skill);
            const result = await runner.execute(plan);
            skill.prompt = result;
            skill.category = 'agent';
          } catch (err: any) {
            console.warn(`Failed to pre-execute composite skill "${skill.name}":`, err.message);
            // Keep the skill as-is; orchestrator will use its prompt/description
          }
        }
      }
    }

    const orchestrator = new Orchestrator(
      session,
      (evt) => manager.sendEvent(req.params.id, evt),
    );
    orchestrators.set(req.params.id, orchestrator);

    // Run in background
    let cancelled = false;
    const promise = orchestrator.run(spec);
    promise.catch((err) => {
      if (!cancelled) console.error('Orchestrator run error:', err);
    });

    runningTasks.set(req.params.id, {
      cancel: () => { cancelled = true; },
    });

    res.json({ status: 'started' });
  });

  // Stop session
  app.post('/api/sessions/:id/stop', async (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) { res.status(404).json({ detail: 'Session not found' }); return; }

    const task = runningTasks.get(req.params.id);
    if (task) {
      task.cancel();
      runningTasks.delete(req.params.id);
    }

    session.state = 'done';
    await manager.sendEvent(req.params.id, {
      type: 'error',
      message: 'Build stopped by user',
      recoverable: false,
    });

    res.json({ status: 'stopped' });
  });

  // Get tasks
  app.get('/api/sessions/:id/tasks', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) { res.status(404).json({ detail: 'Session not found' }); return; }
    res.json(session.tasks);
  });

  // Get git
  app.get('/api/sessions/:id/git', (req, res) => {
    const orch = orchestrators.get(req.params.id);
    if (!orch) { res.status(404).json({ detail: 'Session not found' }); return; }
    res.json(orch.getCommits());
  });

  // Get tests
  app.get('/api/sessions/:id/tests', (req, res) => {
    const orch = orchestrators.get(req.params.id);
    if (!orch) { res.status(404).json({ detail: 'Session not found' }); return; }
    res.json(orch.getTestResults());
  });

  // Gate response
  app.post('/api/sessions/:id/gate', (req, res) => {
    const orch = orchestrators.get(req.params.id);
    if (!orch) { res.status(404).json({ detail: 'Session not found' }); return; }
    orch.respondToGate(req.body.approved ?? true, req.body.feedback ?? '');
    res.json({ status: 'ok' });
  });

  // Question response
  app.post('/api/sessions/:id/question', (req, res) => {
    const orch = orchestrators.get(req.params.id);
    if (!orch) { res.status(404).json({ detail: 'Session not found' }); return; }
    orch.respondToQuestion(req.body.task_id, req.body.answers ?? {});
    res.json({ status: 'ok' });
  });

  // Export session nugget as zip
  app.get('/api/sessions/:id/export', (req, res) => {
    const orch = orchestrators.get(req.params.id);
    if (!orch) { res.status(404).json({ detail: 'Session not found' }); return; }

    const dir = orch.nuggetDir;
    if (!fs.existsSync(dir)) {
      res.status(404).json({ detail: 'Nugget directory not found' });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="nugget.zip"');

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.on('error', (err) => {
      res.status(500).json({ detail: err.message });
    });
    archive.pipe(res);
    archive.directory(dir, false, (entry) => {
      // Exclude .git and node_modules
      if (entry.name.startsWith('.git/') || entry.name.startsWith('node_modules/')) {
        return false as unknown as archiver.EntryData;
      }
      return entry;
    });
    archive.finalize();
  });

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

  // -- Skill Execution --

  // Start standalone skill execution
  app.post('/api/skills/run', (req, res) => {
    const { plan, allSkills } = req.body;
    if (!plan) { res.status(400).json({ detail: 'plan is required' }); return; }

    const sessionId = randomUUID();
    sessions.set(sessionId, {
      id: sessionId,
      state: 'executing',
      spec: null,
      tasks: [],
      agents: [],
    });

    const agentRunner = new AgentRunner();
    const runner = new SkillRunner(
      (evt) => manager.sendEvent(sessionId, evt),
      allSkills ?? [],
      agentRunner,
    );
    skillRunners.set(sessionId, runner);

    // Run async
    runner.execute(plan).catch((err) => {
      console.error('SkillRunner error:', err);
    }).finally(() => {
      const session = sessions.get(sessionId);
      if (session) session.state = 'done';
    });

    res.json({ session_id: sessionId });
  });

  // Answer a skill's ask_user question
  app.post('/api/skills/:sessionId/answer', (req, res) => {
    const runner = skillRunners.get(req.params.sessionId);
    if (!runner) { res.status(404).json({ detail: 'Skill session not found' }); return; }
    runner.respondToQuestion(req.body.step_id, req.body.answers ?? {});
    res.json({ status: 'ok' });
  });

  // Hardware detect
  app.post('/api/hardware/detect', async (_req, res) => {
    const board = await hardwareService.detectBoard();
    if (board) {
      res.json({ detected: true, port: board.port, board_type: board.boardType });
    } else {
      res.json({ detected: false });
    }
  });

  // Hardware flash
  app.post('/api/hardware/flash/:id', async (req, res) => {
    const orch = orchestrators.get(req.params.id);
    if (!orch) { res.status(404).json({ detail: 'Session not found' }); return; }
    const result = await hardwareService.flash(orch.nuggetDir);
    res.json({ success: result.success, message: result.message });
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

    wss.handleUpgrade(request, socket, head, (ws) => {
      const sessionId = match[1];
      manager.connect(sessionId, ws);
      ws.on('close', () => manager.disconnect(sessionId, ws));
      ws.on('message', () => {
        // Client keepalive; ignore content
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`Elisa backend listening on port ${port}`);
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
