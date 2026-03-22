/**
 * Copies a selected game/graphics framework library into a nugget workspace.
 *
 * After the MetaPlanner selects a framework, this copies the minified JS file
 * from the bundled frameworks/ directory into the workspace's lib/ directory.
 * Agents then reference it via <script src="lib/phaser.min.js">.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getFrameworksDir } from './resourcePath.js';

export type FrameworkId = 'phaser' | 'p5' | 'threejs';

const FRAMEWORK_FILES: Record<FrameworkId, string> = {
  phaser: 'phaser.min.js',
  p5: 'p5.min.js',
  threejs: 'three.min.js',
};

/**
 * Copy the selected framework library into the nugget workspace's lib/ directory.
 * Returns the relative path (e.g. "lib/phaser.min.js") or null if unavailable.
 */
export function copyFrameworkToWorkspace(
  frameworkId: FrameworkId,
  nuggetDir: string,
): string | null {
  const filename = FRAMEWORK_FILES[frameworkId];
  if (!filename) return null;

  const srcDir = getFrameworksDir();
  const srcFile = path.join(srcDir, filename);
  if (!fs.existsSync(srcFile)) {
    console.warn(`[frameworkLoader] Framework file not found: ${srcFile}`);
    return null;
  }

  const libDir = path.join(nuggetDir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  const destFile = path.join(libDir, filename);
  fs.copyFileSync(srcFile, destFile);
  return `lib/${filename}`;
}

/** Check whether framework files are available on this system. */
export function isFrameworkAvailable(frameworkId: FrameworkId): boolean {
  const filename = FRAMEWORK_FILES[frameworkId];
  if (!filename) return false;
  return fs.existsSync(path.join(getFrameworksDir(), filename));
}
