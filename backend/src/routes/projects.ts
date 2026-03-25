/** Project routes: /api/projects/* and session restore. */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { listProjects } from '../services/projectIndex.js';
import type { SessionStore } from '../services/sessionStore.js';

interface ProjectRouterDeps {
  store: SessionStore;
}

export function createProjectRouter({ store }: ProjectRouterDeps): Router {
  const router = Router();

  // GET /api/projects -- list all saved projects
  router.get('/', (_req, res) => {
    try {
      const projects = listProjects();
      res.json(projects);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ detail: message });
    }
  });

  // POST /api/sessions/:id/restore -- restore a session from a project directory
  router.post('/sessions/:id/restore', (req, res) => {
    const { projectDir } = req.body;
    if (!projectDir || typeof projectDir !== 'string') {
      res.status(400).json({ detail: 'projectDir is required' });
      return;
    }

    const sessionFile = path.join(projectDir, '.elisa', 'session.json');
    if (!fs.existsSync(sessionFile)) {
      res.status(404).json({ detail: 'No session.json found in project directory' });
      return;
    }

    let data: any;
    try {
      const raw = fs.readFileSync(sessionFile, 'utf-8');
      data = JSON.parse(raw);
    } catch {
      res.status(422).json({ detail: 'Invalid session.json' });
      return;
    }

    // Create a new session entry from the persisted data
    const sessionId = req.params.id || randomUUID();
    const session = data.session ?? {
      id: sessionId,
      state: data.state ?? 'done',
      spec: data.spec ?? null,
      tasks: data.tasks ?? [],
      agents: data.agents ?? [],
    };

    // Ensure session ID matches the route parameter
    session.id = sessionId;

    const entry = store.create(sessionId, session);
    entry.userWorkspace = true;

    // Restore additional fields if present
    if (data.testResults) session.testResults = data.testResults;
    if (data.individualTestResults) session.individualTestResults = data.individualTestResults;
    if (data.testGatePassed !== undefined) session.testGatePassed = data.testGatePassed;

    res.json({
      session_id: sessionId,
      projectDir,
      session,
    });
  });

  return router;
}
