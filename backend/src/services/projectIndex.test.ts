/** Tests for projectIndex service. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { slugify, resolveProjectDir, listProjects, getProjectsDir } from './projectIndex.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-proj-idx-test-'));
  // Mock os.homedir to point to our temp dir so getProjectsDir() resolves there
  vi.spyOn(os, 'homedir').mockReturnValue(tmpDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('slugify', () => {
  it('converts simple goal to slug', () => {
    expect(slugify('My Cool Game')).toBe('my-cool-game');
  });

  it('removes special characters', () => {
    expect(slugify('Hello, World! @#$%')).toBe('hello-world');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(slugify('a   b---c')).toBe('a-b-c');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });

  it('returns "project" for empty input', () => {
    expect(slugify('')).toBe('project');
    expect(slugify('   ')).toBe('project');
    expect(slugify('!!!')).toBe('project');
  });
});

describe('getProjectsDir', () => {
  it('returns ~/Elisa/projects/', () => {
    const result = getProjectsDir();
    expect(result).toBe(path.join(tmpDir, 'Elisa', 'projects'));
  });
});

describe('resolveProjectDir', () => {
  it('returns base path when no collision', () => {
    const result = resolveProjectDir('My Game');
    expect(result).toBe(path.join(tmpDir, 'Elisa', 'projects', 'my-game'));
  });

  it('appends -2 on first collision', () => {
    const projectsDir = getProjectsDir();
    fs.mkdirSync(path.join(projectsDir, 'my-game'), { recursive: true });

    const result = resolveProjectDir('My Game');
    expect(result).toBe(path.join(projectsDir, 'my-game-2'));
  });

  it('increments suffix on multiple collisions', () => {
    const projectsDir = getProjectsDir();
    fs.mkdirSync(path.join(projectsDir, 'my-game'), { recursive: true });
    fs.mkdirSync(path.join(projectsDir, 'my-game-2'), { recursive: true });
    fs.mkdirSync(path.join(projectsDir, 'my-game-3'), { recursive: true });

    const result = resolveProjectDir('My Game');
    expect(result).toBe(path.join(projectsDir, 'my-game-4'));
  });

  it('creates the projects directory if missing', () => {
    const projectsDir = getProjectsDir();
    expect(fs.existsSync(projectsDir)).toBe(false);

    resolveProjectDir('Test');
    expect(fs.existsSync(projectsDir)).toBe(true);
  });
});

describe('listProjects', () => {
  it('returns empty array when projects dir does not exist', () => {
    expect(listProjects()).toEqual([]);
  });

  it('returns projects with valid session.json files', () => {
    const projectsDir = getProjectsDir();
    const projDir = path.join(projectsDir, 'cool-app');
    const elisaDir = path.join(projDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });

    fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
      sessionId: 'sess-123',
      state: 'done',
      savedAt: '2026-03-25T10:00:00Z',
      spec: { nugget: { goal: 'Cool App' } },
      framework: 'phaser',
    }));

    const result = listProjects();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('cool-app');
    expect(result[0].sessionId).toBe('sess-123');
    expect(result[0].goal).toBe('Cool App');
    expect(result[0].state).toBe('done');
    expect(result[0].framework).toBe('phaser');
  });

  it('skips directories without session.json', () => {
    const projectsDir = getProjectsDir();
    fs.mkdirSync(path.join(projectsDir, 'no-session'), { recursive: true });

    expect(listProjects()).toEqual([]);
  });

  it('skips directories with corrupt session.json', () => {
    const projectsDir = getProjectsDir();
    const projDir = path.join(projectsDir, 'bad-json');
    const elisaDir = path.join(projDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), '{not valid json');

    expect(listProjects()).toEqual([]);
  });

  it('sorts by savedAt descending', () => {
    const projectsDir = getProjectsDir();

    for (const [slug, savedAt] of [['old', '2026-01-01T00:00:00Z'], ['new', '2026-03-25T00:00:00Z'], ['mid', '2026-02-15T00:00:00Z']]) {
      const elisaDir = path.join(projectsDir, slug, '.elisa');
      fs.mkdirSync(elisaDir, { recursive: true });
      fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
        sessionId: `sess-${slug}`,
        state: 'done',
        savedAt,
        spec: { nugget: { goal: slug } },
      }));
    }

    const result = listProjects();
    expect(result).toHaveLength(3);
    expect(result[0].slug).toBe('new');
    expect(result[1].slug).toBe('mid');
    expect(result[2].slug).toBe('old');
  });

  it('handles session.json with nested session object', () => {
    const projectsDir = getProjectsDir();
    const elisaDir = path.join(projectsDir, 'nested', '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'session.json'), JSON.stringify({
      session: { id: 'sess-nested', state: 'done' },
      savedAt: '2026-03-25T00:00:00Z',
      spec: { goal: 'Nested Goal' },
    }));

    const result = listProjects();
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('sess-nested');
    expect(result[0].goal).toBe('Nested Goal');
  });
});
