/** Validates workspace paths against an allowlist of safe directories. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type PathValidationResult =
  | { valid: true; resolved: string }
  | { valid: false; reason: string };

/**
 * Validates that a workspace path is within allowed directories.
 *
 * Allowed roots (normalized, case-insensitive on Windows):
 *  - User home directory (os.homedir())
 *  - OS temp directory (os.tmpdir())
 *  - Custom root via ELISA_WORKSPACE_ROOT env var
 */
export function validateWorkspacePath(rawPath: string): PathValidationResult {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    return { valid: false, reason: 'Path must be a non-empty string' };
  }

  // Block null bytes (could bypass checks in C-backed fs calls)
  if (rawPath.includes('\0')) {
    return { valid: false, reason: 'Path contains null bytes' };
  }

  // On Windows, reject UNC paths (\\server\share)
  if (rawPath.startsWith('\\\\')) {
    return { valid: false, reason: 'UNC paths are not allowed' };
  }

  let resolved = path.resolve(rawPath);

  // Resolve symlinks if the path already exists on disk
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // Path doesn't exist yet -- use the resolve() result.
    // Still check that the *parent* isn't a symlink escape.
    try {
      const parent = path.dirname(resolved);
      const realParent = fs.realpathSync(parent);
      resolved = path.join(realParent, path.basename(resolved));
    } catch {
      // Parent doesn't exist either; resolve() result is fine.
    }
  }

  // Defense-in-depth: reject if ".." still appears after resolution
  const segments = resolved.split(path.sep);
  if (segments.includes('..')) {
    return { valid: false, reason: 'Path contains disallowed ".." segment after resolution' };
  }

  // Build the allowlist
  const allowedRoots: string[] = [
    os.homedir(),
    os.tmpdir(),
  ];

  // Resolve symlinks in the roots themselves (e.g., macOS /tmp -> /private/tmp)
  for (let i = 0; i < allowedRoots.length; i++) {
    try {
      allowedRoots[i] = fs.realpathSync(allowedRoots[i]);
    } catch {
      // keep the original value
    }
  }

  const customRoot = process.env.ELISA_WORKSPACE_ROOT;
  if (customRoot) {
    try {
      allowedRoots.push(fs.realpathSync(customRoot));
    } catch {
      allowedRoots.push(path.resolve(customRoot));
    }
  }

  const isUnder = (child: string, root: string): boolean => {
    const normChild = child.toLowerCase();
    const normRoot = root.toLowerCase();
    return normChild === normRoot || normChild.startsWith(normRoot + path.sep);
  };

  const allowed = allowedRoots.some((root) => isUnder(resolved, root));
  if (!allowed) {
    return { valid: false, reason: 'Path is outside allowed directories (home, temp, or ELISA_WORKSPACE_ROOT)' };
  }

  return { valid: true, resolved };
}
