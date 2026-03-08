/** Session-related route handlers: /api/sessions/* */

import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import archiver from 'archiver';
import { randomUUID } from 'node:crypto';
import { Orchestrator } from '../services/orchestrator.js';
import { AgentRunner } from '../services/agentRunner.js';
import { SkillRunner } from '../services/skillRunner.js';
import { NuggetSpecSchema, detectTruncations } from '../utils/specValidator.js';
import { validateWorkspacePath } from '../utils/pathValidator.js';
import { findFreePort } from '../utils/findFreePort.js';
import { safeEnv } from '../utils/safeEnv.js';
import type { HardwareService } from '../services/hardwareService.js';
import type { SessionStore } from '../services/sessionStore.js';
import type { DeviceRegistry } from '../services/deviceRegistry.js';
import type { MeetingRegistry } from '../services/meetingRegistry.js';
import type { MeetingService } from '../services/meetingService.js';
import type { RuntimeProvisioner } from '../services/runtimeProvisioner.js';
import type { SpecGraphService } from '../services/specGraph.js';
import type { SkillSpec } from '../models/skillPlan.js';
import type { WSEvent } from '../services/phases/types.js';

interface SessionRouterDeps {
  store: SessionStore;
  sendEvent: (sessionId: string, event: WSEvent) => Promise<void>;
  hardwareService?: HardwareService;
  deviceRegistry?: DeviceRegistry;
  meetingRegistry?: MeetingRegistry;
  meetingService?: MeetingService;
  runtimeProvisioner?: RuntimeProvisioner;
  specGraphService?: SpecGraphService;
}

export function createSessionRouter({ store, sendEvent, hardwareService, deviceRegistry, meetingRegistry, meetingService, runtimeProvisioner, specGraphService }: SessionRouterDeps): Router {
  const router = Router();

  // Create session
  router.post('/', (_req, res) => {
    const sessionId = randomUUID();
    store.create(sessionId, {
      id: sessionId,
      state: 'idle',
      spec: null,
      tasks: [],
      agents: [],
    });
    res.json({ session_id: sessionId });
  });

  // Get session
  router.get('/:id', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) { res.status(404).json({ detail: 'Session not found' }); return; }
    res.json(entry.session);
  });

  // Start session
  router.post('/:id/start', async (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) { res.status(404).json({ detail: 'Session not found' }); return; }

    if (entry.session.state !== 'idle') {
      res.status(409).json({ detail: 'Session already started' });
      return;
    }

    // Claim the session synchronously to prevent duplicate orchestrators
    // from concurrent POST /start requests hitting the idle guard above.
    entry.session.state = 'planning';

    const rawSpec = req.body.spec;

    // Detect fields that exceed Zod schema caps before validation
    const truncationWarnings = detectTruncations(rawSpec);

    const parseResult = NuggetSpecSchema.safeParse(rawSpec);
    if (!parseResult.success) {
      entry.session.state = 'idle';
      res.status(400).json({
        detail: 'Invalid NuggetSpec',
        errors: parseResult.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
      return;
    }
    const spec = parseResult.data;
    entry.session.spec = spec;

    // Emit truncation warnings so the frontend knows which fields were capped
    if (truncationWarnings.length > 0) {
      await sendEvent(req.params.id, {
        type: 'spec_validation_warning',
        truncated_fields: truncationWarnings.map((w) => ({
          path: w.path,
          max_length: w.maxLength,
          actual_length: w.actualLength,
        })),
      });
    }

    // Pre-execute composite skills
    if (spec.skills?.length) {
      const agentRunner = new AgentRunner();
      const skills = spec.skills as unknown as SkillSpec[];
      for (const skill of skills) {
        if (skill.category === 'composite' && skill.workspace) {
          try {
            const runner = new SkillRunner(
              (evt) => sendEvent(req.params.id, evt),
              skills,
              agentRunner,
            );
            const plan = runner.interpretWorkspaceOnBackend(skill);
            const result = await runner.execute(plan);
            skill.prompt = result;
            skill.category = 'agent';
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Failed to pre-execute composite skill "${skill.name}":`, message);
          }
        }
      }
    }

    // Validate optional workspace_path
    const rawWorkspacePath: string | undefined = req.body.workspace_path;
    let workspacePath: string | undefined;
    if (rawWorkspacePath) {
      if (typeof rawWorkspacePath !== 'string' || rawWorkspacePath.length > 500) {
        res.status(400).json({ detail: 'workspace_path must be a string of at most 500 characters' });
        return;
      }
      const validation = validateWorkspacePath(rawWorkspacePath);
      if (!validation.valid) {
        res.status(400).json({ detail: validation.reason });
        return;
      }
      try {
        fs.mkdirSync(validation.resolved, { recursive: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ detail: `Cannot create workspace directory: ${message}` });
        return;
      }
      workspacePath = validation.resolved;
      entry.userWorkspace = true;
    }

    // Write design artifacts to workspace when path is provided
    if (workspacePath) {
      const artifacts: Record<string, string> = {
        'nugget.json': JSON.stringify(spec, null, 2),
        'workspace.json': JSON.stringify(req.body.workspace_json ?? {}, null, 2),
        'skills.json': JSON.stringify(spec.skills ?? [], null, 2),
        'rules.json': JSON.stringify(spec.rules ?? [], null, 2),
        'portals.json': JSON.stringify(spec.portals ?? [], null, 2),
      };
      for (const [name, content] of Object.entries(artifacts)) {
        fs.writeFileSync(path.join(workspacePath, name), content, 'utf-8');
      }
    }

    const orchestrator = new Orchestrator(
      entry.session,
      (evt) => sendEvent(req.params.id, evt),
      hardwareService,
      workspacePath,
      deviceRegistry,
      meetingRegistry,
      runtimeProvisioner,
      specGraphService,
      meetingService,
    );
    entry.orchestrator = orchestrator;

    let cancelled = false;
    const sessionId = req.params.id;
    const promise = orchestrator.run(spec);
    promise
      .catch((err) => {
        if (!cancelled) console.error('Orchestrator run error:', err);
      })
      .finally(() => {
        store.scheduleCleanup(sessionId);
      });

    entry.cancelFn = () => {
      cancelled = true;
      orchestrator.cancel();
    };

    res.json({ status: 'started' });
  });

  // Stop session
  router.post('/:id/stop', async (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) { res.status(404).json({ detail: 'Session not found' }); return; }

    if (entry.cancelFn) {
      entry.cancelFn();
      entry.cancelFn = null;
    }

    entry.session.state = 'done';
    await sendEvent(req.params.id, {
      type: 'error',
      message: 'Build stopped by user',
      recoverable: false,
    });

    store.scheduleCleanup(req.params.id, 0);

    res.json({ status: 'stopped' });
  });

  // Fix bug (post-build targeted fix)
  router.post('/:id/fix', async (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) { res.status(404).json({ detail: 'Session not found' }); return; }

    if (entry.session.state !== 'done') {
      res.status(409).json({ detail: 'Session must be in done state to run a fix' });
      return;
    }

    const { bugReport } = req.body ?? {};
    if (!bugReport || typeof bugReport !== 'string') {
      res.status(400).json({ detail: 'bugReport is required and must be a string' });
      return;
    }

    if (!entry.orchestrator) {
      res.status(409).json({ detail: 'No orchestrator available for this session' });
      return;
    }

    res.json({ status: 'fix_started' });
    store.scheduleCleanup(req.params.id); // Reset 5-min cleanup timer on fix start

    entry.orchestrator.runFix(bugReport).catch((err) => {
      console.error('Fix run error:', err);
      const message = err instanceof Error ? err.message : String(err);
      sendEvent(req.params.id, {
        type: 'error',
        message: `Fix failed: ${message}`,
        recoverable: false,
      });
    });
  });

  // Get tasks
  router.get('/:id/tasks', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) { res.status(404).json({ detail: 'Session not found' }); return; }
    res.json(entry.session.tasks);
  });

  // Get git
  router.get('/:id/git', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry?.orchestrator) { res.status(404).json({ detail: 'Session not found' }); return; }
    res.json(entry.orchestrator.getCommits());
  });

  // Get tests
  router.get('/:id/tests', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry?.orchestrator) { res.status(404).json({ detail: 'Session not found' }); return; }
    res.json(entry.orchestrator.getTestResults());
  });

  // Gate response
  router.post('/:id/gate', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry?.orchestrator) { res.status(404).json({ detail: 'Session not found' }); return; }
    entry.orchestrator.respondToGate(req.body.approved ?? true, req.body.feedback ?? '');
    res.json({ status: 'ok' });
  });

  // Question response
  router.post('/:id/question', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry?.orchestrator) { res.status(404).json({ detail: 'Session not found' }); return; }
    entry.orchestrator.respondToQuestion(req.body.task_id, req.body.answers ?? {});
    res.json({ status: 'ok' });
  });

  // Export session nugget as zip
  router.get('/:id/export', (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry?.orchestrator) { res.status(404).json({ detail: 'Session not found' }); return; }

    const dir = entry.orchestrator.nuggetDir;
    const resolvedDir = path.resolve(dir);
    // For non-user workspaces, restrict to tmpdir; for user workspaces, allow their chosen path
    if (!entry.userWorkspace) {
      const expectedPrefix = path.resolve(os.tmpdir());
      if (!resolvedDir.startsWith(expectedPrefix + path.sep) && resolvedDir !== expectedPrefix) {
        res.status(403).json({ detail: 'Nugget directory outside allowed path' });
        return;
      }
    }
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
      if (entry.name.startsWith('.git/') || entry.name.startsWith('node_modules/') || entry.name.startsWith('.elisa/logs/')) {
        return false as unknown as archiver.EntryData;
      }
      return entry;
    });
    archive.finalize();
  });

  // Launch: serve existing build files without rebuilding
  router.post('/:id/launch', async (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) { res.status(404).json({ detail: 'Session not found' }); return; }

    store.scheduleCleanup(req.params.id); // Reset 5-min cleanup timer on launch

    // Determine workspace directory: explicit body param, orchestrator's nuggetDir, or nothing
    const rawPath: string | undefined = req.body.workspace_path;
    let workspaceDir: string | undefined;

    if (rawPath) {
      if (typeof rawPath !== 'string' || rawPath.length > 500) {
        res.status(400).json({ detail: 'workspace_path must be a string of at most 500 characters' });
        return;
      }
      const validation = validateWorkspacePath(rawPath);
      if (!validation.valid) {
        res.status(400).json({ detail: validation.reason });
        return;
      }
      workspaceDir = validation.resolved;
    } else if (entry.orchestrator) {
      workspaceDir = entry.orchestrator.nuggetDir;
    }

    if (!workspaceDir || !fs.existsSync(workspaceDir)) {
      res.status(400).json({ detail: 'No workspace directory available' });
      return;
    }

    // Find directory to serve: dist/ > build/ > public/ > src/ > .
    const candidates = ['dist', 'build', 'public', 'src', '.'];
    let serveDir = workspaceDir;
    for (const dir of candidates) {
      const full = dir === '.' ? workspaceDir : path.join(workspaceDir, dir);
      if (fs.existsSync(path.join(full, 'index.html'))) {
        serveDir = full;
        break;
      }
    }

    // Verify there is something to serve
    if (!fs.existsSync(path.join(serveDir, 'index.html'))) {
      res.status(400).json({ detail: 'No index.html found in workspace' });
      return;
    }

    // Kill previous launch process if any
    if (entry.launchProcess) {
      try { entry.launchProcess.kill(); } catch { /* ignore */ }
      entry.launchProcess = null;
    }

    const port = await findFreePort(3000);
    const isWin = process.platform === 'win32';

    try {
      const serverProcess = spawn('npx', ['serve', '-p', String(port)], {
        cwd: serveDir,
        stdio: 'pipe',
        detached: false,
        shell: isWin,
        env: safeEnv(),
      });

      // Wait for server to start and parse actual URL from output
      const result = await new Promise<{ started: boolean; url: string | null }>((resolve) => {
        let resolved = false;
        const urlPattern = /Accepting connections at (http:\/\/localhost:\d+)/;

        const checkOutput = (data: Buffer) => {
          const match = data.toString().match(urlPattern);
          if (match && !resolved) {
            resolved = true;
            resolve({ started: true, url: match[1] });
          }
        };
        serverProcess.stdout?.on('data', checkOutput);
        serverProcess.stderr?.on('data', checkOutput);

        serverProcess.on('error', () => {
          if (!resolved) { resolved = true; resolve({ started: false, url: null }); }
        });
        serverProcess.on('close', () => {
          if (!resolved) { resolved = true; resolve({ started: false, url: null }); }
        });
        setTimeout(() => {
          if (!resolved) { resolved = true; resolve({ started: true, url: null }); }
        }, 5000);
      });

      if (!result.started) {
        res.status(500).json({ detail: 'Failed to start preview server' });
        return;
      }

      const url = result.url ?? `http://localhost:${port}`;
      entry.launchProcess = serverProcess;

      // Emit deploy_complete so frontend can pick up the URL
      await sendEvent(req.params.id, { type: 'deploy_complete', target: 'web', url });

      res.json({ url });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ detail: `Launch failed: ${message}` });
    }
  });

  return router;
}
