/**
 * electron-builder configuration.
 *
 * JS config (rather than package.json) so we can conditionally skip
 * Windows code signing when no certificate is available (local dev).
 */

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
};
