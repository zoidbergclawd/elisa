import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { PermissionPolicy } from '../permissionPolicy.js';

const WORKSPACE = path.resolve('/tmp/elisa-nugget-test');

describe('PermissionPolicy', () => {
  let policy: PermissionPolicy;

  beforeEach(() => {
    policy = new PermissionPolicy(WORKSPACE);
  });

  describe('file write evaluation', () => {
    it('approves file write within workspace', () => {
      const result = policy.evaluate('file_write', path.join(WORKSPACE, 'src', 'app.js'));
      expect(result.decision).toBe('approved');
      expect(result.permission_type).toBe('file_write');
    });

    it('denies file write outside workspace', () => {
      const result = policy.evaluate('file_write', '/etc/passwd');
      expect(result.decision).toBe('denied');
      expect(result.reason).toContain('outside workspace');
    });

    it('approves file_edit within workspace', () => {
      const result = policy.evaluate('file_edit', path.join(WORKSPACE, 'src', 'index.ts'));
      expect(result.decision).toBe('approved');
    });

    it('escalates workspace writes when auto_approve is disabled', () => {
      const strictPolicy = new PermissionPolicy(WORKSPACE, { auto_approve_workspace_writes: false });
      const result = strictPolicy.evaluate('file_write', path.join(WORKSPACE, 'src', 'app.js'));
      expect(result.decision).toBe('escalate');
    });
  });

  describe('safe command evaluation', () => {
    const safeCommands = ['ls', 'cat', 'python', 'python3', 'node', 'pytest', 'mkdir', 'cp', 'mv'];

    for (const cmd of safeCommands) {
      it(`approves safe command: ${cmd}`, () => {
        const result = policy.evaluate('command', `${cmd} some-arg`);
        expect(result.decision).toBe('approved');
        expect(result.permission_type).toBe('bash_safe');
      });
    }

    it('also works with "bash" permission type', () => {
      const result = policy.evaluate('bash', 'ls -la');
      expect(result.decision).toBe('approved');
    });
  });

  describe('unknown command evaluation', () => {
    it('denies unknown command: gcc', () => {
      const result = policy.evaluate('command', 'gcc main.c');
      expect(result.decision).toBe('denied');
      expect(result.permission_type).toBe('bash_unknown');
    });

    it('denies unknown command: docker', () => {
      const result = policy.evaluate('command', 'docker run ubuntu');
      expect(result.decision).toBe('denied');
    });
  });

  describe('network command evaluation', () => {
    it('denies curl by default', () => {
      const result = policy.evaluate('command', 'curl https://example.com');
      expect(result.decision).toBe('denied');
      expect(result.permission_type).toBe('network');
    });

    it('denies wget by default', () => {
      const result = policy.evaluate('command', 'wget https://example.com/file.zip');
      expect(result.decision).toBe('denied');
      expect(result.permission_type).toBe('network');
    });

    it('approves network commands when allow_network is true', () => {
      const networkPolicy = new PermissionPolicy(WORKSPACE, { allow_network: true });
      const result = networkPolicy.evaluate('command', 'curl https://example.com');
      expect(result.decision).toBe('approved');
      expect(result.permission_type).toBe('network');
    });
  });

  describe('npm test', () => {
    it('approves npm test', () => {
      const result = policy.evaluate('command', 'npm test');
      expect(result.decision).toBe('approved');
      expect(result.permission_type).toBe('bash_safe');
    });

    it('approves npm run test', () => {
      const result = policy.evaluate('command', 'npm run test');
      expect(result.decision).toBe('approved');
    });
  });

  describe('package install escalation', () => {
    it('escalates pip install', () => {
      const result = policy.evaluate('command', 'pip install requests');
      expect(result.decision).toBe('escalate');
      expect(result.permission_type).toBe('package_install');
    });

    it('escalates pip3 install', () => {
      const result = policy.evaluate('command', 'pip3 install flask');
      expect(result.decision).toBe('escalate');
    });

    it('escalates npm install', () => {
      const result = policy.evaluate('command', 'npm install lodash');
      expect(result.decision).toBe('escalate');
      expect(result.permission_type).toBe('package_install');
    });
  });

  describe('denial count tracking', () => {
    it('tracks denials per task', () => {
      policy.evaluate('command', 'gcc main.c', 'task-1');
      expect(policy.getDenialCount('task-1')).toBe(1);

      policy.evaluate('command', 'docker run ubuntu', 'task-1');
      expect(policy.getDenialCount('task-1')).toBe(2);
    });

    it('does not track denials without taskId', () => {
      policy.evaluate('command', 'gcc main.c');
      expect(policy.getDenialCount('task-1')).toBe(0);
    });

    it('tracks denials independently per task', () => {
      policy.evaluate('command', 'gcc main.c', 'task-1');
      policy.evaluate('command', 'docker run x', 'task-2');

      expect(policy.getDenialCount('task-1')).toBe(1);
      expect(policy.getDenialCount('task-2')).toBe(1);
    });
  });

  describe('escalation threshold', () => {
    it('escalates after 3 denials (default threshold)', () => {
      policy.evaluate('command', 'gcc a', 'task-1');
      policy.evaluate('command', 'gcc b', 'task-1');
      const result = policy.evaluate('command', 'gcc c', 'task-1');

      expect(result.decision).toBe('escalate');
      expect(result.reason).toContain('Too many denied requests');
    });

    it('respects custom escalation threshold', () => {
      const strictPolicy = new PermissionPolicy(WORKSPACE, { escalation_threshold: 2 });
      strictPolicy.evaluate('command', 'gcc a', 'task-1');
      const result = strictPolicy.evaluate('command', 'gcc b', 'task-1');

      expect(result.decision).toBe('escalate');
    });
  });

  describe('reset()', () => {
    it('clears denial counts', () => {
      policy.evaluate('command', 'gcc a', 'task-1');
      policy.evaluate('command', 'gcc b', 'task-1');
      expect(policy.getDenialCount('task-1')).toBe(2);

      policy.reset();
      expect(policy.getDenialCount('task-1')).toBe(0);
    });
  });

  describe('custom config overrides', () => {
    it('disables safe command auto-approval', () => {
      const strictPolicy = new PermissionPolicy(WORKSPACE, { auto_approve_safe_commands: false });
      const result = strictPolicy.evaluate('command', 'ls -la');
      expect(result.decision).toBe('denied');
    });
  });

  describe('unknown permission type', () => {
    it('denies unknown permission types', () => {
      const result = policy.evaluate('unknown_type', 'something');
      expect(result.decision).toBe('denied');
      expect(result.reason).toContain('Unknown permission type');
    });
  });

  describe('path-based command names', () => {
    it('handles full path commands', () => {
      const result = policy.evaluate('command', '/usr/bin/python script.py');
      expect(result.decision).toBe('approved');
    });

    it('handles .exe extension on Windows', () => {
      const result = policy.evaluate('command', 'python.exe script.py');
      expect(result.decision).toBe('approved');
    });
  });
});
