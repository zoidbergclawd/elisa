/** Behavioral tests for ContextManager new methods:
 * - buildStructuralDigest
 * - extractSignatures
 * - checkBudget
 * - capSummary
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContextManager } from '../../utils/contextManager.js';

let tmpDir: string | null = null;

function makeTmp(): string {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `test-cm-${Date.now()}-`));
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

// ---------------------------------------------------------------------------
// buildStructuralDigest
// ---------------------------------------------------------------------------
describe('buildStructuralDigest', () => {
  it('extracts signatures from .ts, .js, .py files and returns formatted digest', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'index.ts'), [
      'export function greet(name: string) { return name; }',
      'export class Greeter {}',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'utils.js'), [
      'export const TIMEOUT = 5000;',
      'export function delay(ms) {}',
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'main.py'), [
      'def main():',
      '    pass',
      '',
      'class App:',
      '    pass',
    ].join('\n'));

    const digest = ContextManager.buildStructuralDigest(dir);
    expect(digest).toContain('## Structural Digest');
    // TS signatures
    expect(digest).toContain('index.ts');
    expect(digest).toContain('export function greet');
    expect(digest).toContain('export class Greeter');
    // JS signatures
    expect(digest).toContain('utils.js');
    expect(digest).toContain('export const TIMEOUT');
    expect(digest).toContain('export function delay');
    // Python signatures
    expect(digest).toContain('main.py');
    expect(digest).toContain('def main()');
    expect(digest).toContain('class App');
  });

  it('returns empty string for empty directory', () => {
    const dir = makeTmp();
    expect(ContextManager.buildStructuralDigest(dir)).toBe('');
  });

  it('returns empty string for directory with only non-source files', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'data.json'), '{}');
    fs.writeFileSync(path.join(dir, 'style.css'), 'body {}');
    fs.writeFileSync(path.join(dir, 'readme.md'), '# Hi');
    expect(ContextManager.buildStructuralDigest(dir)).toBe('');
  });

  it('respects maxFiles cap', () => {
    const dir = makeTmp();
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(dir, `mod${i}.ts`),
        `export function fn${i}() {}\n`,
      );
    }
    const digest = ContextManager.buildStructuralDigest(dir, 3);
    const headers = digest.match(/^### /gm) ?? [];
    expect(headers.length).toBe(3);
  });

  it('ignores node_modules and .git directories', () => {
    const dir = makeTmp();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'lib.js'), 'export function lib() {}');
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, '.git', 'hook.js'), 'export function hook() {}');
    fs.writeFileSync(path.join(dir, 'app.ts'), 'export function app() {}');

    const digest = ContextManager.buildStructuralDigest(dir);
    expect(digest).toContain('app.ts');
    expect(digest).not.toContain('lib.js');
    expect(digest).not.toContain('hook.js');
  });

  it('ignores non-source file extensions (.json, .css, .md)', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'config.json'), '{}');
    fs.writeFileSync(path.join(dir, 'theme.css'), 'body {}');
    fs.writeFileSync(path.join(dir, 'notes.md'), '# Notes');
    fs.writeFileSync(path.join(dir, 'app.js'), 'export function run() {}');

    const digest = ContextManager.buildStructuralDigest(dir);
    expect(digest).toContain('app.js');
    expect(digest).not.toContain('config.json');
    expect(digest).not.toContain('theme.css');
    expect(digest).not.toContain('notes.md');
  });

  it('shows "(no exported signatures detected)" for source files without signatures', () => {
    const dir = makeTmp();
    fs.writeFileSync(path.join(dir, 'empty.ts'), '// just a comment\nconst x = 1;\n');

    const digest = ContextManager.buildStructuralDigest(dir);
    expect(digest).toContain('empty.ts');
    expect(digest).toContain('(no exported signatures detected)');
  });

  it('sorts files by most recently modified first', () => {
    const dir = makeTmp();
    // Create files with staggered mtimes
    const older = path.join(dir, 'older.ts');
    const newer = path.join(dir, 'newer.ts');
    fs.writeFileSync(older, 'export function old() {}');
    // Set older file's mtime to 10 seconds ago
    const past = new Date(Date.now() - 10_000);
    fs.utimesSync(older, past, past);
    fs.writeFileSync(newer, 'export function fresh() {}');

    const digest = ContextManager.buildStructuralDigest(dir);
    const olderPos = digest.indexOf('older.ts');
    const newerPos = digest.indexOf('newer.ts');
    expect(newerPos).toBeLessThan(olderPos);
  });
});

// ---------------------------------------------------------------------------
// extractSignatures
// ---------------------------------------------------------------------------
describe('extractSignatures', () => {
  it('extracts TypeScript exports: function, class, const', () => {
    const dir = makeTmp();
    const file = path.join(dir, 'mod.ts');
    fs.writeFileSync(file, [
      'export function foo(x: number) { return x; }',
      'export class Bar {}',
      'export const baz = 42;',
    ].join('\n'));

    const sigs = ContextManager.extractSignatures(file);
    expect(sigs).toContain('export function foo');
    expect(sigs).toContain('export class Bar');
    expect(sigs).toContain('export const baz');
  });

  it('extracts Python def and class signatures', () => {
    const dir = makeTmp();
    const file = path.join(dir, 'mod.py');
    fs.writeFileSync(file, [
      'def foo():',
      '    pass',
      '',
      'class Bar:',
      '    pass',
    ].join('\n'));

    const sigs = ContextManager.extractSignatures(file);
    expect(sigs).toContain('def foo()');
    expect(sigs).toContain('class Bar');
  });

  it('returns empty array for file with no signatures', () => {
    const dir = makeTmp();
    const file = path.join(dir, 'empty.ts');
    fs.writeFileSync(file, '// nothing here\nconst x = 1;\n');
    expect(ContextManager.extractSignatures(file)).toEqual([]);
  });

  it('returns empty array for non-existent file', () => {
    expect(ContextManager.extractSignatures('/does/not/exist.ts')).toEqual([]);
  });

  it('handles export default function', () => {
    const dir = makeTmp();
    const file = path.join(dir, 'def.ts');
    fs.writeFileSync(file, 'export default function main() {}\n');

    const sigs = ContextManager.extractSignatures(file);
    expect(sigs).toContain('export function main');
  });

  it('handles async function', () => {
    const dir = makeTmp();
    const file = path.join(dir, 'async.ts');
    fs.writeFileSync(file, 'async function fetchData() { return []; }\n');

    const sigs = ContextManager.extractSignatures(file);
    expect(sigs).toContain('function fetchData()');
  });

  it('handles export type and export interface', () => {
    const dir = makeTmp();
    const file = path.join(dir, 'types.ts');
    fs.writeFileSync(file, [
      'export type Config = { port: number };',
      'export interface Service { start(): void; }',
    ].join('\n'));

    const sigs = ContextManager.extractSignatures(file);
    expect(sigs).toContain('export type Config');
    expect(sigs).toContain('export interface Service');
  });

  it('handles Python async def', () => {
    const dir = makeTmp();
    const file = path.join(dir, 'async.py');
    fs.writeFileSync(file, 'async def fetch():\n    pass\n');

    const sigs = ContextManager.extractSignatures(file);
    expect(sigs).toContain('async def fetch()');
  });

  it('handles export let', () => {
    const dir = makeTmp();
    const file = path.join(dir, 'lets.ts');
    fs.writeFileSync(file, 'export let counter = 0;\n');

    const sigs = ContextManager.extractSignatures(file);
    expect(sigs).toContain('export let counter');
  });
});

// ---------------------------------------------------------------------------
// checkBudget
// ---------------------------------------------------------------------------
describe('checkBudget', () => {
  it('returns withinBudget=true when under budget', () => {
    const cm = new ContextManager(10_000);
    const result = cm.checkBudget(5_000);
    expect(result.withinBudget).toBe(true);
    expect(result.remaining).toBe(5_000);
  });

  it('returns withinBudget=false when over budget', () => {
    const cm = new ContextManager(10_000);
    const result = cm.checkBudget(15_000);
    expect(result.withinBudget).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('returns withinBudget=false at exact budget boundary', () => {
    const cm = new ContextManager(10_000);
    const result = cm.checkBudget(10_000);
    // remaining = maxTokens - currentTokens = 0, and remaining > 0 is false
    expect(result.withinBudget).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('returns withinBudget=true with 1 token remaining', () => {
    const cm = new ContextManager(10_000);
    const result = cm.checkBudget(9_999);
    expect(result.withinBudget).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it('uses default maxTokens of 500_000', () => {
    const cm = new ContextManager();
    const result = cm.checkBudget(50_000);
    expect(result.withinBudget).toBe(true);
    expect(result.remaining).toBe(450_000);
  });

  it('remaining never goes below 0', () => {
    const cm = new ContextManager(100);
    const result = cm.checkBudget(999_999);
    expect(result.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// capSummary
// ---------------------------------------------------------------------------
describe('capSummary', () => {
  it('returns short text unchanged when under 500 words', () => {
    const short = 'This is a short summary with a few words.';
    expect(ContextManager.capSummary(short)).toBe(short);
  });

  it('truncates text over 500 words with [truncated] marker', () => {
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`);
    const longText = words.join(' ');
    const result = ContextManager.capSummary(longText);
    expect(result).toContain('[truncated]');
    // Should have exactly 500 words + the marker
    const resultWords = result.split(/\s+/);
    // 500 words + "[truncated]" = 501 tokens
    expect(resultWords.length).toBe(501);
    expect(resultWords[500]).toBe('[truncated]');
    expect(resultWords[0]).toBe('word0');
    expect(resultWords[499]).toBe('word499');
  });

  it('returns text unchanged when exactly 500 words', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`);
    const exact = words.join(' ');
    expect(ContextManager.capSummary(exact)).toBe(exact);
  });

  it('handles empty string', () => {
    expect(ContextManager.capSummary('')).toBe('');
  });

  it('respects custom maxWords parameter', () => {
    const text = 'one two three four five six seven eight nine ten';
    const result = ContextManager.capSummary(text, 3);
    expect(result).toBe('one two three [truncated]');
  });

  it('handles single word', () => {
    expect(ContextManager.capSummary('hello')).toBe('hello');
  });
});
