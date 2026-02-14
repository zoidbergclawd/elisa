import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContextManager } from './contextManager.js';

describe('ContextManager.capSummary', () => {
  it('returns text unchanged when under word limit', () => {
    const text = 'Hello world foo bar';
    expect(ContextManager.capSummary(text, 10)).toBe(text);
  });

  it('truncates at word boundary and appends [truncated]', () => {
    const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const result = ContextManager.capSummary(text, 5);
    expect(result).toBe('word0 word1 word2 word3 word4 [truncated]');
    expect(result.endsWith('[truncated]')).toBe(true);
  });

  it('returns exact text when word count equals limit', () => {
    const text = 'one two three';
    expect(ContextManager.capSummary(text, 3)).toBe(text);
  });
});

describe('ContextManager.buildFileManifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-cm-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists files in a temp directory with forward slashes', () => {
    fs.writeFileSync(path.join(tmpDir, 'main.ts'), '// main entry');
    const manifest = ContextManager.buildFileManifest(tmpDir);
    expect(manifest).toContain('main.ts');
    // Should include first-line hint
    expect(manifest).toContain('// main entry');
  });

  it('skips .git and node_modules directories', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.writeFileSync(path.join(tmpDir, '.git', 'config'), 'repo config');
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'app.ts'), '// app');

    const manifest = ContextManager.buildFileManifest(tmpDir);
    expect(manifest).toContain('app.ts');
    expect(manifest).not.toContain('.git');
    expect(manifest).not.toContain('node_modules');
  });

  it('respects maxEntries limit', () => {
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${i}.txt`), `content ${i}`);
    }
    const manifest = ContextManager.buildFileManifest(tmpDir, 3);
    const lines = manifest.split('\n').filter(Boolean);
    expect(lines.length).toBe(3);
  });

  it('returns empty string for empty directory', () => {
    const manifest = ContextManager.buildFileManifest(tmpDir);
    expect(manifest).toBe('');
  });
});

describe('ContextManager.extractSignatures', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-sig-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts export function/class/const signatures from .ts files', () => {
    const tsFile = path.join(tmpDir, 'mod.ts');
    fs.writeFileSync(tsFile, [
      'export function greet(name: string): string {',
      '  return `Hello ${name}`;',
      '}',
      'export class Greeter {',
      '  greet() {}',
      '}',
      'export const MAX = 100;',
    ].join('\n'));

    const sigs = ContextManager.extractSignatures(tsFile);
    expect(sigs).toContain('export function greet');
    expect(sigs).toContain('export class Greeter');
    expect(sigs).toContain('export const MAX');
  });

  it('extracts def and class signatures from .py files', () => {
    const pyFile = path.join(tmpDir, 'app.py');
    fs.writeFileSync(pyFile, [
      'class Robot:',
      '    def move(self):',
      '        pass',
      '',
      'def main():',
      '    pass',
      '',
      'async def fetch_data():',
      '    pass',
    ].join('\n'));

    const sigs = ContextManager.extractSignatures(pyFile);
    expect(sigs).toContain('class Robot');
    expect(sigs).toContain('def main()');
    expect(sigs).toContain('async def fetch_data()');
  });

  it('returns empty array for non-existent file', () => {
    const sigs = ContextManager.extractSignatures(path.join(tmpDir, 'nope.ts'));
    expect(sigs).toEqual([]);
  });
});

describe('ContextManager.getTransitivePredecessors', () => {
  it('follows a linear dependency chain', () => {
    const taskMap: Record<string, Record<string, any>> = {
      a: { dependencies: [] },
      b: { dependencies: ['a'] },
      c: { dependencies: ['b'] },
    };
    const preds = ContextManager.getTransitivePredecessors('c', taskMap);
    expect(preds).toContain('b');
    expect(preds).toContain('a');
  });

  it('follows a diamond dependency graph', () => {
    const taskMap: Record<string, Record<string, any>> = {
      a: { dependencies: [] },
      b: { dependencies: ['a'] },
      c: { dependencies: ['a'] },
      d: { dependencies: ['b', 'c'] },
    };
    const preds = ContextManager.getTransitivePredecessors('d', taskMap);
    expect(preds).toContain('b');
    expect(preds).toContain('c');
    expect(preds).toContain('a');
  });

  it('returns empty array when task has no dependencies', () => {
    const taskMap: Record<string, Record<string, any>> = {
      a: { dependencies: [] },
    };
    const preds = ContextManager.getTransitivePredecessors('a', taskMap);
    expect(preds).toEqual([]);
  });

  it('handles missing tasks gracefully', () => {
    const taskMap: Record<string, Record<string, any>> = {};
    const preds = ContextManager.getTransitivePredecessors('missing', taskMap);
    expect(preds).toEqual([]);
  });

  it('does not visit the same node twice in a cycle', () => {
    const taskMap: Record<string, Record<string, any>> = {
      a: { dependencies: ['b'] },
      b: { dependencies: ['a'] },
    };
    // Should terminate even with circular deps
    const preds = ContextManager.getTransitivePredecessors('a', taskMap);
    expect(preds).toContain('b');
    expect(preds).toContain('a');
  });
});

describe('ContextManager instance methods', () => {
  it('tracks token usage per agent', () => {
    const cm = new ContextManager();
    cm.track('Builder', 1000);
    cm.track('Builder', 500);
    cm.track('Tester', 200);
    expect(cm.getUsage()).toEqual({ Builder: 1500, Tester: 200 });
  });

  it('checkBudget reports within and exceeding budget', () => {
    const cm = new ContextManager(1000);
    expect(cm.checkBudget(500)).toEqual({ withinBudget: true, remaining: 500 });
    expect(cm.checkBudget(1500)).toEqual({ withinBudget: false, remaining: 0 });
  });
});
