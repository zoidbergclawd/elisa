/** Workspace route handlers: /api/workspace/* */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export function createWorkspaceRouter(): Router {
  const router = Router();

  /**
   * POST /api/workspace/save
   * Write design files to a workspace directory (pre-build save).
   */
  router.post('/save', (req, res) => {
    const { workspace_path, workspace_json, skills, rules, portals } = req.body;

    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ detail: 'workspace_path is required' });
      return;
    }

    const resolved = path.resolve(workspace_path);
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch (err: any) {
      res.status(400).json({ detail: `Cannot create directory: ${err.message}` });
      return;
    }

    const artifacts: Record<string, string> = {
      'workspace.json': JSON.stringify(workspace_json ?? {}, null, 2),
      'skills.json': JSON.stringify(skills ?? [], null, 2),
      'rules.json': JSON.stringify(rules ?? [], null, 2),
      'portals.json': JSON.stringify(portals ?? [], null, 2),
    };

    try {
      for (const [name, content] of Object.entries(artifacts)) {
        fs.writeFileSync(path.join(resolved, name), content, 'utf-8');
      }
    } catch (err: any) {
      res.status(500).json({ detail: `Failed to write files: ${err.message}` });
      return;
    }

    res.json({ status: 'saved' });
  });

  /**
   * POST /api/workspace/load
   * Read design files from a workspace directory.
   */
  router.post('/load', (req, res) => {
    const { workspace_path } = req.body;

    if (!workspace_path || typeof workspace_path !== 'string') {
      res.status(400).json({ detail: 'workspace_path is required' });
      return;
    }

    const resolved = path.resolve(workspace_path);
    if (!fs.existsSync(resolved)) {
      res.status(404).json({ detail: 'Directory not found' });
      return;
    }

    const readJson = (filename: string): unknown => {
      const filePath = path.join(resolved, filename);
      if (!fs.existsSync(filePath)) return null;
      try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        return null;
      }
    };

    res.json({
      workspace: readJson('workspace.json') ?? {},
      skills: readJson('skills.json') ?? [],
      rules: readJson('rules.json') ?? [],
      portals: readJson('portals.json') ?? [],
    });
  });

  return router;
}
