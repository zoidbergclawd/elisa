/** Behavioral tests for Issue 5: Parallel task execution and structural context.
 *
 * Covers:
 * - CONTEXT-5: buildStructuralDigest and extractSignatures
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ContextManager } from '../../utils/contextManager.js';

let tmpDir: string | null = null;

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('CONTEXT-5: extractSignatures', () => {
  it('extracts Python function and class signatures', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-sigs-'));
    const pyFile = path.join(tmpDir, 'app.py');
    fs.writeFileSync(pyFile, [
      'class Game:',
      '    def __init__(self):',
      '        pass',
      '',
      'def main():',
      '    print("hello")',
      '',
      'async def fetch_data():',
      '    pass',
    ].join('\n'));

    const sigs = ContextManager.extractSignatures(pyFile);
    expect(sigs).toContain('class Game');
    expect(sigs).toContain('def main()');
    expect(sigs).toContain('async def fetch_data()');
  });

  it('extracts JS/TS function and class signatures', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-sigs-'));
    const jsFile = path.join(tmpDir, 'app.ts');
    fs.writeFileSync(jsFile, [
      'export function greet(name: string): string {',
      '  return `hello ${name}`;',
      '}',
      '',
      'export class Player {',
      '  score: number;',
      '}',
      '',
      'export const MAX_SCORE = 100;',
      '',
      'export default function main() {}',
    ].join('\n'));

    const sigs = ContextManager.extractSignatures(jsFile);
    expect(sigs).toContain('export function greet');
    expect(sigs).toContain('export class Player');
    expect(sigs).toContain('export const MAX_SCORE');
  });

  it('returns empty for non-existent file', () => {
    const sigs = ContextManager.extractSignatures('/nonexistent/file.py');
    expect(sigs).toEqual([]);
  });
});

describe('CONTEXT-5: buildStructuralDigest', () => {
  it('builds digest from workspace with mixed file types', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-digest-'));
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'main.py'), 'def main():\n    pass\n');
    fs.writeFileSync(path.join(srcDir, 'app.js'), 'export function start() {}\n');
    fs.writeFileSync(path.join(srcDir, 'style.css'), 'body { color: red; }');

    const digest = ContextManager.buildStructuralDigest(tmpDir);
    expect(digest).toContain('Structural Digest');
    expect(digest).toContain('src/main.py');
    expect(digest).toContain('def main()');
    expect(digest).toContain('src/app.js');
    expect(digest).toContain('export function start');
    // CSS should not be included
    expect(digest).not.toContain('style.css');
  });

  it('returns empty string for empty workspace', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-digest-'));
    const digest = ContextManager.buildStructuralDigest(tmpDir);
    expect(digest).toBe('');
  });

  it('respects maxFiles limit', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-digest-'));
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(
        path.join(tmpDir, `file${i}.js`),
        `export function fn${i}() {}\n`,
      );
    }
    const digest = ContextManager.buildStructuralDigest(tmpDir, 5);
    // Should only include 5 files
    const fileHeaders = (digest.match(/^### /gm) ?? []);
    expect(fileHeaders.length).toBeLessThanOrEqual(5);
  });

  it('skips .git, node_modules, .elisa directories', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-digest-'));
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.writeFileSync(path.join(tmpDir, '.git', 'config.js'), 'export const x = 1;\n');
    fs.mkdirSync(path.join(tmpDir, 'node_modules'));
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg.js'), 'export const y = 2;\n');
    fs.writeFileSync(path.join(tmpDir, 'app.js'), 'export function main() {}\n');

    const digest = ContextManager.buildStructuralDigest(tmpDir);
    expect(digest).toContain('app.js');
    expect(digest).not.toContain('config.js');
    expect(digest).not.toContain('pkg.js');
  });
});
