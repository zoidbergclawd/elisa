/**
 * electron-builder configuration.
 *
 * JS config (rather than package.json) so we can:
 * - Conditionally skip Windows code signing without a certificate (local dev)
 * - Use afterPack hook to rename vendor/ -> node_modules/ for ESM resolution
 */

const path = require('path');
const fs = require('fs');

const hasWindowsCert = !!process.env.WIN_CSC_LINK;

module.exports = {
  appId: 'com.elisa.app',
  productName: 'Elisa',
  directories: {
    output: 'release',
  },
  files: [
    'electron/dist/**/*',
    'electron/settings.html',
  ],
  extraResources: [
    {
      from: 'frontend/dist',
      to: 'frontend-dist',
    },
    {
      from: 'backend/dist',
      to: 'backend-dist',
      filter: ['**/*'],
    },
    {
      from: 'devices/_shared',
      to: 'devices/_shared',
    },
  ],
  win: {
    target: 'nsis',
    icon: 'build/icon.ico',
    // Skip signing when no certificate is available (local dev).
    // With a cert (CI), omit signExts so the default (.exe) applies.
    ...(hasWindowsCert ? {} : { signAndEditExecutable: false }),
  },
  mac: {
    target: ['dmg', 'zip'],
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  publish: {
    provider: 'github',
    owner: 'zoidbergclawd',
    repo: 'elisa',
  },
  afterPack(context) {
    // Rename vendor/ back to node_modules/ so ESM import resolution works.
    // We use "vendor" during build to prevent electron-builder from filtering
    // out the directory (it strips node_modules from extraResources).
    const vendor = path.join(context.appOutDir, 'resources', 'backend-dist', 'vendor');
    const nodeModules = path.join(context.appOutDir, 'resources', 'backend-dist', 'node_modules');
    if (fs.existsSync(vendor)) {
      fs.renameSync(vendor, nodeModules);
    }
  },
};
