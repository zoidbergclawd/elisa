/** Session-related route handlers: /api/sessions/* */

import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import archiver from 'archiver';
import { randomUUID } from 'node:crypto';
import { Orchestrator } from '../services/orchestrator.js';
import { AgentRunner } from '../services/agentRunner.js';
import { SkillRunner } from '../services/skillRunner.js';
import { NuggetSpecSchema } from '../utils/specValidator.js';
import type { HardwareService } from '../services/hardwareService.js';
import type { SessionStore } from '../services/sessionStore.js';
import type { SkillSpec } from '../models/skillPlan.js';

interface SessionRouterDeps {
  store: SessionStore;
  sendEvent: (sessionId: string, event: Record<string, any>) => Promise<void>;
  hardwareService?: HardwareService;
}

export function createSessionRouter({ store, sendEvent, hardwareService }: SessionRouterDeps): Router {
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

    const rawSpec = req.body.spec;
    const parseResult = NuggetSpecSchema.safeParse(rawSpec);
    if (!parseResult.success) {
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
    entry.session.state = 'planning';
    entry.session.spec = spec;

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
          } catch (err: any) {
            console.warn(`Failed to pre-execute composite skill "${skill.name}":`, err.message);
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
      const resolved = path.resolve(rawWorkspacePath);
      // Block obvious system directories
      const blocked = ['/bin', '/sbin', '/usr', '/etc', '/var', '/boot', '/lib',
        'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'];
      if (blocked.some(b => resolved.toLowerCase().startsWith(b.toLowerCase()))) {
        res.status(400).json({ detail: 'workspace_path points to a protected system directory' });
        return;
      }
      try {
        fs.mkdirSync(resolved, { recursive: true });
      } catch (err: any) {
        res.status(400).json({ detail: `Cannot create workspace directory: ${err.message}` });
        return;
      }
      workspacePath = resolved;
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

    res.json({ status: 'stopped' });
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

  return router;
}
