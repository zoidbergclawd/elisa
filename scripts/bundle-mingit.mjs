/**
 * Download and prepare MinGit for Windows bundling.
 *
 * MinGit provides git + POSIX tools needed by Claude Code CLI.
 * MinGit's sh.exe IS GNU bash (same binary, POSIX mode by default),
 * so we copy it to bash.exe to satisfy Claude Code's requirement.
 *
 * Only runs on Windows. Skipped on other platforms.
 */

import { existsSync, mkdirSync, cpSync, copyFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

if (process.platform !== 'win32') {
  console.log('MinGit bundling skipped (not Windows)');
  process.exit(0);
}

const MINGIT_VERSION = '2.53.0.2';
const MINGIT_URL = `https://github.com/git-for-windows/git/releases/download/v2.53.0.windows.2/MinGit-${MINGIT_VERSION}-64-bit.zip`;
const DEST_DIR = join(process.cwd(), 'build', 'mingit');
const CACHE_ZIP = join(process.cwd(), 'build', 'mingit.zip');

// Skip if already extracted
if (existsSync(join(DEST_DIR, 'cmd', 'git.exe'))) {
  console.log('MinGit already present, skipping download');
  process.exit(0);
}

mkdirSync(join(process.cwd(), 'build'), { recursive: true });

// Download
if (!existsSync(CACHE_ZIP)) {
  console.log(`Downloading MinGit ${MINGIT_VERSION}...`);
  execSync(`curl -sL "${MINGIT_URL}" -o "${CACHE_ZIP}"`, { stdio: 'inherit' });
}

// Extract
console.log('Extracting MinGit...');
rmSync(DEST_DIR, { recursive: true, force: true });
mkdirSync(DEST_DIR, { recursive: true });
execSync(
  `powershell.exe -NoProfile -Command "Expand-Archive -Path '${CACHE_ZIP}' -DestinationPath '${DEST_DIR}' -Force"`,
  { stdio: 'inherit' },
);

// MinGit's sh.exe is GNU bash in POSIX mode. Copy it to bash.exe so
// Claude Code CLI can find it via CLAUDE_CODE_GIT_BASH_PATH.
const shExe = join(DEST_DIR, 'usr', 'bin', 'sh.exe');
const bashExe = join(DEST_DIR, 'usr', 'bin', 'bash.exe');
if (existsSync(shExe) && !existsSync(bashExe)) {
  copyFileSync(shExe, bashExe);
  console.log('Copied sh.exe -> bash.exe');
}

console.log(`MinGit ${MINGIT_VERSION} ready at ${DEST_DIR}`);
