import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { validateWorkspacePath } from './pathValidator.js';

describe('validateWorkspacePath', () => {
  const originalRoot = process.env.ELISA_WORKSPACE_ROOT;

  afterEach(() => {
    if (originalRoot !== undefined) {
      process.env.ELISA_WORKSPACE_ROOT = originalRoot;
    } else {
      delete process.env.ELISA_WORKSPACE_ROOT;
    }
  });

  it('accepts a path under the home directory', () => {
    const testPath = path.join(os.homedir(), 'projects', 'my-nugget');
    const result = validateWorkspacePath(testPath);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved).toContain('my-nugget');
    }
  });

  it('accepts a path under the temp directory', () => {
    const testPath = path.join(os.tmpdir(), 'elisa-workspace');
    const result = validateWorkspacePath(testPath);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.resolved).toBeTruthy();
    }
  });

  it('accepts a path under custom ELISA_WORKSPACE_ROOT', () => {
    const customRoot = path.join(os.tmpdir(), 'custom-root');
    process.env.ELISA_WORKSPACE_ROOT = customRoot;
    const testPath = path.join(customRoot, 'workspace-a');
    const result = validateWorkspacePath(testPath);
    expect(result.valid).toBe(true);
  });

  it('rejects a path outside allowed roots', () => {
    delete process.env.ELISA_WORKSPACE_ROOT;
    // Use a path that is definitely outside home and temp
    const outsidePath = process.platform === 'win32'
      ? 'C:\\Windows\\System32\\evil'
      : '/etc/passwd';
    const result = validateWorkspacePath(outsidePath);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('outside allowed directories');
    }
  });

  it('rejects UNC paths', () => {
    const result = validateWorkspacePath('\\\\evil-server\\share\\data');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('UNC');
    }
  });

  it('rejects paths with null bytes', () => {
    const result = validateWorkspacePath('/home/user/safe\0/../../etc/passwd');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('null bytes');
    }
  });

  it('rejects empty string', () => {
    const result = validateWorkspacePath('');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('non-empty string');
    }
  });

  it('rejects non-string input', () => {
    const result = validateWorkspacePath(123 as unknown as string);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('non-empty string');
    }
  });

  it('resolves traversal attempts back into allowed roots', () => {
    // path.resolve will normalize out the ".." so this ends up under homedir
    const testPath = path.join(os.homedir(), 'projects', '..', 'other');
    const result = validateWorkspacePath(testPath);
    // After resolution, this is os.homedir()/other -- still under home, so valid
    expect(result.valid).toBe(true);
  });

  it('rejects traversal attempts that escape allowed roots', () => {
    delete process.env.ELISA_WORKSPACE_ROOT;
    // Go far enough up from homedir to escape it
    const homeParts = os.homedir().split(path.sep);
    const ups = homeParts.map(() => '..').join(path.sep);
    const escapePath = path.join(os.homedir(), ups, 'etc', 'passwd');
    const result = validateWorkspacePath(escapePath);
    // After resolution this points to /etc/passwd (or similar), which is outside allowed roots
    expect(result.valid).toBe(false);
  });
});
