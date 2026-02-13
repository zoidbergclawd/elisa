/** Evaluates permission requests against configurable policy rules. */

import path from 'node:path';

export interface PermissionPolicyConfig {
  auto_approve_workspace_writes: boolean;
  auto_approve_safe_commands: boolean;
  allow_network: boolean;
  escalation_threshold: number;
}

export interface PermissionDecision {
  decision: 'approved' | 'denied' | 'escalate';
  reason: string;
  permission_type: string;
}

const SAFE_COMMANDS = new Set([
  'ls', 'cat', 'echo', 'python', 'python3', 'node', 'pytest', 'npm',
  'mkdir', 'cp', 'mv', 'head', 'tail', 'wc', 'sort', 'grep', 'find',
  'pwd', 'tree', 'touch', 'rm', 'dir', 'type', 'copy', 'move',
]);

const NETWORK_COMMANDS = new Set([
  'curl', 'wget', 'fetch', 'ssh', 'scp', 'rsync', 'nc', 'ncat',
]);

const DEFAULTS: PermissionPolicyConfig = {
  auto_approve_workspace_writes: true,
  auto_approve_safe_commands: true,
  allow_network: false,
  escalation_threshold: 3,
};

export class PermissionPolicy {
  private config: PermissionPolicyConfig;
  private nuggetDir: string;
  private denialCounts = new Map<string, number>();

  constructor(nuggetDir: string, config?: Partial<PermissionPolicyConfig>) {
    this.nuggetDir = path.resolve(nuggetDir);
    this.config = { ...DEFAULTS, ...config };
  }

  evaluate(permissionType: string, detail: string, taskId?: string): PermissionDecision {
    let decision: PermissionDecision;

    if (permissionType === 'file_write' || permissionType === 'file_edit') {
      decision = this.evaluateFileWrite(detail);
    } else if (permissionType === 'bash' || permissionType === 'command') {
      decision = this.evaluateCommand(detail);
    } else {
      decision = { decision: 'denied', reason: `Unknown permission type: ${permissionType}`, permission_type: permissionType };
    }

    // Track denials per task
    if (decision.decision === 'denied' && taskId) {
      const count = (this.denialCounts.get(taskId) ?? 0) + 1;
      this.denialCounts.set(taskId, count);
      if (count >= this.config.escalation_threshold) {
        return {
          decision: 'escalate',
          reason: `Too many denied requests (${count}) for this task. Escalating to user.`,
          permission_type: decision.permission_type,
        };
      }
    }

    return decision;
  }

  private evaluateFileWrite(filePath: string): PermissionDecision {
    const resolved = path.resolve(filePath);
    const isInWorkspace = resolved.startsWith(this.nuggetDir);

    if (isInWorkspace && this.config.auto_approve_workspace_writes) {
      return { decision: 'approved', reason: 'File is within workspace', permission_type: 'file_write' };
    }

    if (!isInWorkspace) {
      return { decision: 'denied', reason: 'File is outside workspace boundary', permission_type: 'file_write' };
    }

    return { decision: 'escalate', reason: 'Workspace writes require approval per policy', permission_type: 'file_write' };
  }

  private evaluateCommand(command: string): PermissionDecision {
    const trimmed = command.trim();
    // Extract the first token (the command name)
    const firstToken = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';
    // Handle path-based commands (e.g., /usr/bin/python -> python)
    const baseName = path.basename(firstToken).replace(/\.exe$/i, '').replace(/\.cmd$/i, '');

    // Check for network commands
    if (NETWORK_COMMANDS.has(baseName)) {
      if (this.config.allow_network) {
        return { decision: 'approved', reason: 'Network access allowed by policy', permission_type: 'network' };
      }
      return { decision: 'denied', reason: 'Network access not allowed', permission_type: 'network' };
    }

    // Check for pip/npm install
    if (baseName === 'pip' || baseName === 'pip3') {
      if (trimmed.includes('install')) {
        return { decision: 'escalate', reason: 'Package installation requires review', permission_type: 'package_install' };
      }
    }
    if (baseName === 'npm' && trimmed.includes('install')) {
      return { decision: 'escalate', reason: 'Package installation requires review', permission_type: 'package_install' };
    }

    // Check against safe list
    if (SAFE_COMMANDS.has(baseName) && this.config.auto_approve_safe_commands) {
      return { decision: 'approved', reason: `Command "${baseName}" is on the safe list`, permission_type: 'bash_safe' };
    }

    // Special case: npm test is safe
    if (baseName === 'npm' && (trimmed.includes('test') || trimmed.includes('run test'))) {
      return { decision: 'approved', reason: 'npm test is safe', permission_type: 'bash_safe' };
    }

    // Unknown command -- deny
    return { decision: 'denied', reason: `Command "${baseName}" is not on the safe list`, permission_type: 'bash_unknown' };
  }

  getDenialCount(taskId: string): number {
    return this.denialCounts.get(taskId) ?? 0;
  }

  reset(): void {
    this.denialCounts.clear();
  }
}
