/**
 * Download game/graphics framework libraries for bundling.
 *
 * Downloads minified builds of Phaser 3, p5.js, and Three.js
 * into build/frameworks/ for inclusion as Electron extraResources.
 * Agents reference these via <script src="lib/framework.min.js">.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const DEST_DIR = join(process.cwd(), 'build', 'frameworks');

const FRAMEWORKS = [
  {
    name: 'phaser',
    filename: 'phaser.min.js',
    url: 'https://cdn.jsdelivr.net/npm/phaser@3.87.0/dist/phaser.min.js',
    license: 'MIT',
  },
  {
    name: 'p5',
    filename: 'p5.min.js',
    url: 'https://cdn.jsdelivr.net/npm/p5@1.11.3/lib/p5.min.js',
    license: 'LGPL-2.1',
  },
  {
    name: 'threejs',
    filename: 'three.min.js',
    url: 'https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.min.js',
    license: 'MIT',
  },
];

// Skip if all files already present
const allPresent = FRAMEWORKS.every(f => existsSync(join(DEST_DIR, f.filename)));
if (allPresent) {
  console.log('All framework libraries already present, skipping download');
  process.exit(0);
}

mkdirSync(DEST_DIR, { recursive: true });

for (const fw of FRAMEWORKS) {
  const dest = join(DEST_DIR, fw.filename);
  if (existsSync(dest)) {
    console.log(`${fw.name}: already downloaded`);
    continue;
  }
  console.log(`Downloading ${fw.name} from ${fw.url}...`);
  try {
    execSync(`curl -sL "${fw.url}" -o "${dest}"`, { stdio: 'inherit' });
    console.log(`${fw.name}: saved to ${fw.filename}`);
  } catch (err) {
    console.error(`Failed to download ${fw.name}: ${err.message}`);
    process.exit(1);
  }
}

// Write a manifest so the backend knows what's available
const manifest = FRAMEWORKS.map(f => ({
  name: f.name,
  filename: f.filename,
  license: f.license,
}));
writeFileSync(join(DEST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`Framework libraries ready at ${DEST_DIR}`);
