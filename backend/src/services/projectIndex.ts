/** Project index: manages persistent project directories under ~/Elisa/projects/. */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ProjectSummary {
  projectDir: string;
  slug: string;
  sessionId: string;
  goal: string;
  state: string;
  savedAt: string;
  framework?: string;
}

/** Returns the root projects directory: ~/Elisa/projects/ */
export function getProjectsDir(): string {
  return path.join(os.homedir(), 'Elisa', 'projects');
}

/** Converts a goal string to a URL-safe slug. */
export function slugify(goal: string): string {
  return goal
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'project';
}

/** Resolves a unique project directory path, appending -2, -3, etc. on collision. */
export function resolveProjectDir(goal: string): string {
  const projectsDir = getProjectsDir();
  fs.mkdirSync(projectsDir, { recursive: true });

  const base = slugify(goal);
  let candidate = path.join(projectsDir, base);

  if (!fs.existsSync(candidate)) return candidate;

  let suffix = 2;
  while (fs.existsSync(path.join(projectsDir, `${base}-${suffix}`))) {
    suffix++;
  }
  return path.join(projectsDir, `${base}-${suffix}`);
}

/** Scans the projects directory for saved sessions, returns summaries. */
export function listProjects(): ProjectSummary[] {
  const projectsDir = getProjectsDir();
  if (!fs.existsSync(projectsDir)) return [];

  const results: ProjectSummary[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectDir = path.join(projectsDir, entry.name);
    const sessionFile = path.join(projectDir, '.elisa', 'session.json');

    if (!fs.existsSync(sessionFile)) continue;

    try {
      const raw = fs.readFileSync(sessionFile, 'utf-8');
      const data = JSON.parse(raw);

      results.push({
        projectDir,
        slug: entry.name,
        sessionId: data.sessionId ?? data.session?.id ?? '',
        goal: data.spec?.nugget?.goal ?? data.spec?.goal ?? '',
        state: data.state ?? data.session?.state ?? 'unknown',
        savedAt: data.savedAt ?? '',
        framework: data.framework,
      });
    } catch {
      // Skip corrupt session files
    }
  }

  // Sort by savedAt descending (most recent first)
  results.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));

  return results;
}
