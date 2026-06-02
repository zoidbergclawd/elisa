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
    // Game/graphics framework libraries (Phaser, p5.js, Three.js)
    ...(fs.existsSync(path.join(__dirname, 'build', 'frameworks', 'manifest.json'))
      ? [{ from: 'build/frameworks', to: 'frameworks' }]
      : []),
    // MinGit: bundled Git + bash for Windows (Claude Code CLI requires git-bash)
    ...(process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'build', 'mingit', 'cmd', 'git.exe'))
      ? [{ from: 'build/mingit', to: 'mingit' }]
      : []),
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
    // The bundled Claude Agent SDK CLI is a Bun-based native binary. Under the
    // hardened runtime it needs JIT, unsigned-executable-memory, library-validation
    // disabled, and dyld env-var passthrough. electron-builder's deep sign re-signs
    // the nested binary under Elisa's identity (do NOT add it to signIgnore).
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    // D3: re-sign + notarize. Requires APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD /
    // APPLE_TEAM_ID (or APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER) in CI.
    notarize: true,
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
    //
    // On macOS, appOutDir is e.g. release/mac-arm64 and resources live inside
    // Elisa.app/Contents/Resources/. On Windows/Linux, they're at appOutDir/resources/.
    const appName = context.packager.appInfo.productFilename;
    const isMac = process.platform === 'darwin';
    const resourcesDir = isMac
      ? path.join(context.appOutDir, `${appName}.app`, 'Contents', 'Resources')
      : path.join(context.appOutDir, 'resources');

    const vendor = path.join(resourcesDir, 'backend-dist', 'vendor');
    const nodeModules = path.join(resourcesDir, 'backend-dist', 'node_modules');
    console.log(`afterPack: renaming ${vendor} -> ${nodeModules} (exists: ${fs.existsSync(vendor)})`);
    if (fs.existsSync(vendor)) {
      fs.renameSync(vendor, nodeModules);
    }

    // Verify the native Claude Agent SDK CLI binary landed at exactly the path
    // backend/src/services/agentRunner.ts resolveClaudeCodePath() expects in prod:
    //   <resources>/backend-dist/node_modules/@anthropic-ai/claude-agent-sdk-<plat>-<arch>/<bin>
    // As of agent-sdk 0.3.x the CLI is a per-platform native binary delivered via
    // the host-platform optional dependency (file name: 'claude', or 'claude.exe' on win32).
    // Each per-arch runner vendors only its OWN host package, so we check against
    // process.platform/process.arch (D1 FULL COVERAGE via per-arch runners).
    const nativeBin = path.join(
      nodeModules,
      '@anthropic-ai',
      `claude-agent-sdk-${process.platform}-${process.arch}`,
      process.platform === 'win32' ? 'claude.exe' : 'claude',
    );
    console.log(`afterPack: native CLI binary expected at: ${nativeBin}`);
    if (!fs.existsSync(nativeBin)) {
      // THROW to fail the build -- a packaged app without this binary cannot run agents.
      throw new Error(
        `afterPack: FATAL -- native Claude Agent SDK CLI binary missing at ${nativeBin}. ` +
          `The host-platform optional dependency ` +
          `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch} was not vendored. ` +
          `Agent builds would be impossible in production; failing the build.`,
      );
    }
    if (process.platform !== 'win32') {
      // Guarantee the user-exec bit survives packaging (NTFS has no POSIX exec bit).
      fs.chmodSync(nativeBin, 0o755);
    }
    const { size, mode } = fs.statSync(nativeBin);
    console.log(
      `afterPack: verified native CLI binary (mode=${(mode & 0o777).toString(8)}, ` +
        `size=${size} bytes, ${(size / (1024 * 1024)).toFixed(1)} MB).`,
    );
  },
};
