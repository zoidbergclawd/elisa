/**
 * Resolve resource paths that differ between dev and packaged Electron.
 *
 * In dev:   paths resolve relative to the repo root.
 * In prod:  Electron sets ELISA_RESOURCES_PATH before loading the backend bundle;
 *           resources live under that directory (placed there by electron-builder extraResources).
 */

import path from 'node:path';

const resourcesPath = process.env.ELISA_RESOURCES_PATH;

/**
 * Resolve the absolute path to the `devices/` directory.
 * Dev:  <repo>/devices
 * Prod: <resources>/devices
 */
export function getDevicesDir(): string {
  if (resourcesPath) {
    return path.join(resourcesPath, 'devices');
  }
  // Dev: import.meta.dirname is backend/src/utils/, go up 3 levels to repo root
  return path.resolve(import.meta.dirname, '..', '..', '..', 'devices');
}

/**
 * Resolve the absolute path to the `devices/_shared` directory.
 */
export function getSharedDevicesDir(): string {
  return path.join(getDevicesDir(), '_shared');
}
