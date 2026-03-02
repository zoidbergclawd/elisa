/** Tests for permissionPolicy.ts -- file write permissions, command evaluation,
 * safe/workspace/network command classification, escalation logic, and denial tracking.
 *
 * No external dependencies to mock; PermissionPolicy is a pure policy evaluator.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionPolicy } from '../services/permissionPolicy.js';
import type { PermissionDecision } from '../services/permissionPolicy.js';

const WORKSPACE = '/tmp/elisa-nugget-test';

// ============================================================
// File write permissions
// ============================================================

describe('file write permissions', () => {
  it('approves writes within the workspace directory', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('file_write', `${WORKSPACE}/src/index.ts`);
    expect(result.decision).toBe('approved');
    expect(result.reason).toContain('within workspace');
  });

  it('approves file_edit within the workspace directory', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('file_edit', `${WORKSPACE}/src/main.py`);
    expect(result.decision).toBe('approved');
  });

  it('denies writes outside the workspace directory', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('file_write', '/etc/passwd');
    expect(result.decision).toBe('denied');
    expect(result.reason).toContain('outside workspace');
  });

  it('denies writes to parent traversal paths', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    // path.resolve normalizes this, so it won't start with WORKSPACE
    const result = policy.evaluate('file_write', `${WORKSPACE}/../../../etc/passwd`);
    expect(result.decision).toBe('denied');
  });

  it('escalates workspace writes when auto_approve_workspace_writes is false', () => {
    const policy = new PermissionPolicy(WORKSPACE, { auto_approve_workspace_writes: false });
    const result = policy.evaluate('file_write', `${WORKSPACE}/src/index.ts`);
    expect(result.decision).toBe('escalate');
    expect(result.reason).toContain('approval per policy');
  });

  it('denies writes outside workspace even when auto_approve is disabled', () => {
    const policy = new PermissionPolicy(WORKSPACE, { auto_approve_workspace_writes: false });
    const result = policy.evaluate('file_write', '/home/user/secrets.txt');
    expect(result.decision).toBe('denied');
  });
});

// ============================================================
// Safe commands (read-only / trivial)
// ============================================================

describe('safe commands', () => {
  const safeCommands = ['ls', 'cat', 'echo', 'head', 'tail', 'wc', 'sort', 'grep', 'find', 'pwd', 'tree', 'dir', 'type'];

  it.each(safeCommands)('approves safe command: %s', (cmd) => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', cmd);
    expect(result.decision).toBe('approved');
    expect(result.permission_type).toBe('bash_safe');
  });

  it('approves safe commands with arguments', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'ls -la /tmp');
    expect(result.decision).toBe('approved');
  });

  it('approves safe commands with path prefix', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', '/usr/bin/cat file.txt');
    expect(result.decision).toBe('approved');
  });

  it('denies safe commands when auto_approve_safe_commands is false', () => {
    const policy = new PermissionPolicy(WORKSPACE, { auto_approve_safe_commands: false });
    const result = policy.evaluate('bash', 'ls');
    expect(result.decision).toBe('denied');
  });
});

// ============================================================
// Workspace-restricted commands
// ============================================================

describe('workspace-restricted commands', () => {
  const workspaceCommands = ['mkdir', 'cp', 'mv', 'touch', 'rm', 'python', 'python3', 'node', 'npm', 'npx', 'pytest'];

  it.each(workspaceCommands)('approves workspace command "%s" when cwd is inside workspace', (cmd) => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', `${cmd} some-arg`, undefined, `${WORKSPACE}/src`);
    expect(result.decision).toBe('approved');
  });

  it.each(workspaceCommands)('escalates workspace command "%s" when cwd is outside workspace', (cmd) => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', `${cmd} some-arg`, undefined, '/home/user');
    expect(result.decision).toBe('escalate');
    expect(result.permission_type).toBe('bash_workspace');
  });

  it.each(workspaceCommands)('escalates workspace command "%s" when no cwd is provided', (cmd) => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', `${cmd} some-arg`);
    expect(result.decision).toBe('escalate');
  });
});

// ============================================================
// Network commands
// ============================================================

describe('network commands', () => {
  const networkCommands = ['curl', 'wget', 'fetch', 'ssh', 'scp', 'rsync', 'nc', 'ncat'];

  it.each(networkCommands)('denies network command "%s" by default', (cmd) => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', `${cmd} http://example.com`);
    expect(result.decision).toBe('denied');
    expect(result.permission_type).toBe('network');
  });

  it.each(networkCommands)('approves network command "%s" when allow_network is true', (cmd) => {
    const policy = new PermissionPolicy(WORKSPACE, { allow_network: true });
    const result = policy.evaluate('bash', `${cmd} http://example.com`);
    expect(result.decision).toBe('approved');
    expect(result.permission_type).toBe('network');
  });
});

// ============================================================
// Package installation escalation
// ============================================================

describe('package installation', () => {
  it('escalates pip install', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'pip install requests');
    expect(result.decision).toBe('escalate');
    expect(result.permission_type).toBe('package_install');
  });

  it('escalates pip3 install', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'pip3 install numpy');
    expect(result.decision).toBe('escalate');
    expect(result.permission_type).toBe('package_install');
  });

  it('escalates npm install', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'npm install express');
    expect(result.decision).toBe('escalate');
    expect(result.permission_type).toBe('package_install');
  });

  it('approves npm test when cwd is inside workspace', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'npm test', undefined, `${WORKSPACE}/src`);
    expect(result.decision).toBe('approved');
  });

  it('escalates npm test when cwd is outside workspace (npm is workspace-restricted)', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'npm test');
    // npm is in WORKSPACE_COMMANDS, so without workspace cwd it escalates
    expect(result.decision).toBe('escalate');
  });

  it('approves npm run test when cwd is inside workspace', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'npm run test', undefined, `${WORKSPACE}/src`);
    expect(result.decision).toBe('approved');
  });
});

// ============================================================
// Unknown commands
// ============================================================

describe('unknown commands', () => {
  it('denies unrecognized commands', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'some-unknown-tool --flag');
    expect(result.decision).toBe('denied');
    expect(result.permission_type).toBe('bash_unknown');
  });

  it('denies dangerous system commands', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    expect(policy.evaluate('bash', 'dd if=/dev/zero of=/dev/sda').decision).toBe('denied');
    expect(policy.evaluate('bash', 'reboot').decision).toBe('denied');
    expect(policy.evaluate('bash', 'shutdown now').decision).toBe('denied');
  });
});

// ============================================================
// Unknown permission types
// ============================================================

describe('unknown permission types', () => {
  it('denies unknown permission types', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('network', 'http://example.com');
    expect(result.decision).toBe('denied');
    expect(result.reason).toContain('Unknown permission type');
  });
});

// ============================================================
// Denial counting and escalation
// ============================================================

describe('denial counting and escalation', () => {
  it('tracks denial count per task', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    policy.evaluate('bash', 'badcmd', 'task-1');
    policy.evaluate('bash', 'badcmd2', 'task-1');
    expect(policy.getDenialCount('task-1')).toBe(2);
  });

  it('escalates after reaching threshold (default: 3)', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    // First two denials: normal denied
    const r1 = policy.evaluate('bash', 'badcmd1', 'task-1');
    expect(r1.decision).toBe('denied');
    const r2 = policy.evaluate('bash', 'badcmd2', 'task-1');
    expect(r2.decision).toBe('denied');
    // Third denial: escalates
    const r3 = policy.evaluate('bash', 'badcmd3', 'task-1');
    expect(r3.decision).toBe('escalate');
    expect(r3.reason).toContain('Too many denied requests');
  });

  it('uses custom escalation threshold', () => {
    const policy = new PermissionPolicy(WORKSPACE, { escalation_threshold: 2 });
    policy.evaluate('bash', 'badcmd1', 'task-1');
    const r2 = policy.evaluate('bash', 'badcmd2', 'task-1');
    expect(r2.decision).toBe('escalate');
  });

  it('tracks denials independently per task', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    policy.evaluate('bash', 'badcmd', 'task-1');
    policy.evaluate('bash', 'badcmd', 'task-1');
    policy.evaluate('bash', 'badcmd', 'task-2');
    expect(policy.getDenialCount('task-1')).toBe(2);
    expect(policy.getDenialCount('task-2')).toBe(1);
  });

  it('does not count denials without a taskId', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    policy.evaluate('bash', 'badcmd');
    policy.evaluate('bash', 'badcmd');
    // No taskId => no tracking
    expect(policy.getDenialCount('')).toBe(0);
  });

  it('returns 0 for unknown task IDs', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    expect(policy.getDenialCount('nonexistent')).toBe(0);
  });

  it('reset() clears all denial counts', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    policy.evaluate('bash', 'badcmd', 'task-1');
    policy.evaluate('bash', 'badcmd', 'task-2');
    expect(policy.getDenialCount('task-1')).toBe(1);
    policy.reset();
    expect(policy.getDenialCount('task-1')).toBe(0);
    expect(policy.getDenialCount('task-2')).toBe(0);
  });
});

// ============================================================
// Command permission type aliasing
// ============================================================

describe('permission type aliasing', () => {
  it('treats "command" the same as "bash"', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('command', 'ls -la');
    expect(result.decision).toBe('approved');
  });
});

// ============================================================
// Edge cases
// ============================================================

describe('edge cases', () => {
  it('handles empty command string gracefully', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', '   ');
    // Empty first token becomes '', which is not in any safe list
    expect(result.decision).toBe('denied');
  });

  it('handles commands with .exe suffix', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'cat.exe file.txt');
    expect(result.decision).toBe('approved');
  });

  it('is case-insensitive for command names', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    const result = policy.evaluate('bash', 'CAT file.txt');
    expect(result.decision).toBe('approved');
  });

  it('config defaults are sensible', () => {
    const policy = new PermissionPolicy(WORKSPACE);
    // Default: workspace writes approved, safe commands approved, no network
    expect(policy.evaluate('file_write', `${WORKSPACE}/file.txt`).decision).toBe('approved');
    expect(policy.evaluate('bash', 'ls').decision).toBe('approved');
    expect(policy.evaluate('bash', 'curl http://example.com').decision).toBe('denied');
  });
});
