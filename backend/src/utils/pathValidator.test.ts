import { describe, it, expect, afterEach } from 'vitest';
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
  });

  it('accepts a user-chosen directory on any drive', () => {
    // Simulates user picking a project folder like C:\git\my-project
    const testPath = process.platform === 'win32'
      ? 'C:\\git\\my-project'
      : '/home/user/projects/my-project';
    const result = validateWorkspacePath(testPath);
    expect(result.valid).toBe(true);
  });

  it('rejects Windows system directories', () => {
    if (process.platform !== 'win32') return; // skip on non-Windows
    const result = validateWorkspacePath('C:\\Windows\\System32\\evil');
    expect(result.valid).toBe(false);
    expect((result as any).reason).toContain('protected system directory');
  });

  it('rejects Unix system directories', () => {
    if (process.platform === 'win32') return; // skip on Windows
    const result = validateWorkspacePath('/etc/evil');
    expect(result.valid).toBe(false);
    expect((result as any).reason).toContain('protected system directory');
  });

  it('rejects sensitive user directories (.ssh)', () => {
    const testPath = path.join(os.homedir(), '.ssh', 'evil');
    const result = validateWorkspacePath(testPath);
    expect(result.valid).toBe(false);
    expect((result as any).reason).toContain('sensitive user directory');
  });

  it('rejects sensitive user directories (.aws)', () => {
    const testPath = path.join(os.homedir(), '.aws', 'evil');
    const result = validateWorkspacePath(testPath);
    expect(result.valid).toBe(false);
    expect((result as any).reason).toContain('sensitive user directory');
  });

  it('enforces ELISA_WORKSPACE_ROOT when set', () => {
    const customRoot = path.join(os.tmpdir(), 'custom-root');
    process.env.ELISA_WORKSPACE_ROOT = customRoot;
    const inside = path.join(customRoot, 'workspace-a');
    const outside = path.join(os.homedir(), 'other');
    expect(validateWorkspacePath(inside).valid).toBe(true);
    expect(validateWorkspacePath(outside).valid).toBe(false);
  });

  it('rejects UNC paths', () => {
    const result = validateWorkspacePath('\\\\evil-server\\share\\data');
    expect(result.valid).toBe(false);
    expect((result as any).reason).toContain('UNC');
  });

  it('rejects paths with null bytes', () => {
    const result = validateWorkspacePath('/home/user/safe\0/../../etc/passwd');
    expect(result.valid).toBe(false);
    expect((result as any).reason).toContain('null bytes');
  });

  it('rejects empty string', () => {
    const result = validateWorkspacePath('');
    expect(result.valid).toBe(false);
  });

  it('rejects non-string input', () => {
    const result = validateWorkspacePath(123 as unknown as string);
    expect(result.valid).toBe(false);
  });

  it('resolves traversal within allowed area', () => {
    const testPath = path.join(os.homedir(), 'projects', '..', 'other');
    const result = validateWorkspacePath(testPath);
    expect(result.valid).toBe(true);
  });
});
