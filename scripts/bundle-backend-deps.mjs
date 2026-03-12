/**
 * Bundle external backend dependencies into backend/dist/vendor/ for Electron packaging.
 *
 * The esbuild backend bundle keeps certain modules external (native addons, large SDKs).
 * This script installs those modules into a temp directory, then copies the resulting
 * node_modules as backend/dist/vendor/ -- avoiding the name "node_modules" because
 * electron-builder filters it out of extraResources.
 */

import { writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const distDir = join(process.cwd(), 'backend', 'dist');
const tempDir = join(distDir, '_deps_tmp');
const vendorDir = join(distDir, 'vendor');

// Clean previous runs
rmSync(tempDir, { recursive: true, force: true });
rmSync(vendorDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

// These match the `external` list in scripts/build-backend.mjs
// (minus node:* builtins which are provided by Electron's Node.js)
const externalDeps = {
  '@anthropic-ai/claude-agent-sdk': '^0.2.39',
  '@anthropic-ai/sdk': '^0.74.0',
  'simple-git': '^3',
  'serialport': '^12',
  '@serialport/bindings-cpp': '*',
};

const pkg = {
  name: 'elisa-backend-deps',
  version: '0.1.0',
  private: true,
  dependencies: externalDeps,
};

writeFileSync(join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));

console.log('Installing external backend deps...');
execSync('npm install --omit=dev', { cwd: tempDir, stdio: 'inherit' });

// Move node_modules -> vendor (avoids electron-builder filtering)
cpSync(join(tempDir, 'node_modules'), vendorDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });

// Remove all .bin directories (including nested ones) — they contain symlinks
// pointing to the now-deleted temp dir and break electron-builder's code signing.
function removeBinDirs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name === '.bin') {
      rmSync(full, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      removeBinDirs(full);
    }
  }
}
removeBinDirs(vendorDir);

console.log('Backend external deps bundled -> backend/dist/vendor/');
