/**
 * Install dependencies in backend/ and frontend/ subdirectories.
 *
 * Replaces the shell-based postinstall that used `npm install --prefix <dir>`,
 * which on some npm versions re-triggers the root postinstall and causes an
 * infinite recursion loop. Running via execSync with `cwd` avoids lifecycle
 * re-triggering.
 */
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const dir of ['backend', 'frontend', 'cli']) {
  const cwd = resolve(root, dir);
  console.log(`Installing dependencies in ${dir}/...`);
  execSync('npm install', { cwd, stdio: 'inherit' });
}
