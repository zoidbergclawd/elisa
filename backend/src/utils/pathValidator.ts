/** Validates workspace paths: blocks dangerous system directories, UNC, null bytes. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type PathValidationResult =
  | { valid: true; resolved: string }
  | { valid: false; reason: string };

/** System directories that must never be used as workspace roots. */
const BLOCKED_PREFIXES_UNIX = [
  '/bin', '/sbin', '/usr', '/etc', '/var', '/boot', '/lib', '/lib64',
  '/proc', '/sys', '/dev',
  '/root',  // root home dir
];

const BLOCKED_PREFIXES_WIN = [
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\Recovery',
  'C:\\$Recycle.Bin',
];

/** Sensitive user directories that should not be workspace roots. */
const BLOCKED_USER_DIRS = [
  '.ssh', '.aws', '.gnupg', '.config/gcloud',
];

/**
 * Validates a workspace path for safety.
 *
 * Strategy: block known-dangerous system directories rather than
 * allowlisting, since this is a desktop app where users legitimately
 * place projects on any drive or directory.
 *
 * Also supports ELISA_WORKSPACE_ROOT env var to restrict paths to
 * a specific root (useful for locked-down deployments).
 */
export function validateWorkspacePath(rawPath: string): PathValidationResult {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return { valid: false, reason: 'Path must be a non-empty string' };
  }

  // Block null bytes
  if (rawPath.includes('\0')) {
    return { valid: false, reason: 'Path contains null bytes' };
  }

  // Reject UNC paths (\\server\share)
  if (rawPath.startsWith('\\\\')) {
    return { valid: false, reason: 'UNC paths are not allowed' };
  }

  let resolved = path.resolve(rawPath);

  // Resolve symlinks if the path exists
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // Path doesn't exist yet -- check parent for symlink escape
    try {
      const parent = path.dirname(resolved);
      const realParent = fs.realpathSync(parent);
      resolved = path.join(realParent, path.basename(resolved));
    } catch {
      // Parent doesn't exist either; resolve() result is fine
    }
  }

  // Defense-in-depth: reject ".." after resolution
  const segments = resolved.split(path.sep);
  if (segments.includes('..')) {
    return { valid: false, reason: 'Path contains disallowed ".." segment after resolution' };
  }

  // If ELISA_WORKSPACE_ROOT is set, enforce strict allowlist
  const customRoot = process.env.ELISA_WORKSPACE_ROOT;
  if (customRoot) {
    let realRoot: string;
    try {
      realRoot = fs.realpathSync(customRoot);
    } catch {
      realRoot = path.resolve(customRoot);
    }
    if (!isUnder(resolved, realRoot)) {
      return { valid: false, reason: `Path is outside ELISA_WORKSPACE_ROOT (${realRoot})` };
    }
    return { valid: true, resolved };
  }

  // Allow OS temp directory before checking blocked prefixes.
  // On macOS, tmpdir (/var/folders/...) resolves under /private/var which
  // would otherwise be caught by the /var blocked prefix.
  let resolvedTmpdir: string;
  try { resolvedTmpdir = fs.realpathSync(os.tmpdir()); } catch { resolvedTmpdir = os.tmpdir(); }
  if (isUnder(resolved, resolvedTmpdir)) {
    return { valid: true, resolved };
  }

  // Block system directories
  const blocked = process.platform === 'win32' ? BLOCKED_PREFIXES_WIN : BLOCKED_PREFIXES_UNIX;
  for (const prefix of blocked) {
    // Resolve symlinks in the prefix (e.g., /etc -> /private/etc on macOS)
    let resolvedPrefix: string;
    try {
      resolvedPrefix = fs.realpathSync(prefix);
    } catch {
      resolvedPrefix = prefix;
    }
    if (isUnder(resolved, resolvedPrefix)) {
      return { valid: false, reason: 'Path points to a protected system directory' };
    }
  }

  // Block sensitive user directories
  const home = os.homedir();
  for (const dir of BLOCKED_USER_DIRS) {
    const sensitive = path.join(home, dir);
    if (isUnder(resolved, sensitive)) {
      return { valid: false, reason: 'Path points to a sensitive user directory' };
    }
  }

  return { valid: true, resolved };
}

function isUnder(child: string, root: string): boolean {
  const normChild = child.toLowerCase();
  const normRoot = root.toLowerCase();
  return normChild === normRoot || normChild.startsWith(normRoot + path.sep);
}
