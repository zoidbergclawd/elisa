/**
 * Bundle external backend dependencies into backend/dist/vendor/ for Electron packaging.
 *
 * The esbuild backend bundle keeps certain modules external (native addons, large SDKs).
 * This script installs those modules into a temp directory, then copies the resulting
 * node_modules as backend/dist/vendor/ -- avoiding the name "node_modules" because
 * electron-builder filters it out of extraResources.
 */

import { writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
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
  '@anthropic-ai/claude-agent-sdk': '^0.3.159',
  '@anthropic-ai/sdk': '^0.100.1',
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

// ---------------------------------------------------------------------------
// Guard: the Claude Agent SDK 0.3.x ships its CLI as a per-platform native
// binary in the HOST-platform optional dependency
// `@anthropic-ai/claude-agent-sdk-<plat>-<arch>` (file name: `claude`, or
// `claude.exe` on win32; ~217MB, mode 0755).
//
// `npm install --omit=dev` KEEPS optionals, so the host-platform native package
// is installed into the temp node_modules and copied into vendor/ above.
// `cpSync` preserves file modes (incl. the 0755 exec bit), and removeBinDirs
// only deletes `.bin` directories -- the native package contains no `.bin`, so
// the binary survives intact.
//
// This binary MUST land at exactly this path so that, after electron-builder's
// afterPack renames vendor/ -> node_modules/, agentRunner.ts's prod branch
// resolves it at:
//   <ELISA_RESOURCES_PATH>/backend-dist/node_modules/@anthropic-ai/claude-agent-sdk-<plat>-<arch>/<bin>
//
// Fail loudly here (build-time) rather than silently shipping a broken bundle.
const nativePkgName = `claude-agent-sdk-${process.platform}-${process.arch}`;
const nativeBinName = process.platform === 'win32' ? 'claude.exe' : 'claude';
const nativeBin = join(vendorDir, '@anthropic-ai', nativePkgName, nativeBinName);

let nativeStat;
try {
  nativeStat = statSync(nativeBin);
} catch (err) {
  console.error(
    `\nFATAL: Claude Agent SDK native CLI binary is MISSING.\n` +
      `  Expected at: ${nativeBin}\n` +
      `  Package:     @anthropic-ai/${nativePkgName}\n` +
      `  Binary:      ${nativeBinName}\n` +
      `  The host-platform optional dependency was not installed/copied.\n` +
      `  Ensure 'npm install --omit=dev' did NOT use --omit=optional.\n` +
      `  Underlying error: ${err.message}\n`,
  );
  process.exit(1);
}

if (!nativeStat.isFile()) {
  console.error(
    `\nFATAL: Claude Agent SDK native CLI path exists but is not a file.\n` +
      `  Path: ${nativeBin}\n`,
  );
  process.exit(1);
}

// On non-Windows, assert the user-exec bit is set (0755 -> S_IXUSR = 0o100).
if (process.platform !== 'win32') {
  const userExec = (nativeStat.mode & 0o100) !== 0;
  if (!userExec) {
    console.error(
      `\nFATAL: Claude Agent SDK native CLI binary is NOT user-executable.\n` +
        `  Path: ${nativeBin}\n` +
        `  Mode: ${(nativeStat.mode & 0o777).toString(8)} (expected exec bit, e.g. 755)\n` +
        `  cpSync should preserve the 0755 mode -- something stripped it.\n`,
    );
    process.exit(1);
  }
}

console.log(
  `Verified native CLI binary: ${nativeBin}\n` +
    `  mode=${(nativeStat.mode & 0o777).toString(8)} ` +
    `size=${nativeStat.size} bytes (${(nativeStat.size / (1024 * 1024)).toFixed(1)} MB)`,
);

console.log('Backend external deps bundled -> backend/dist/vendor/');
