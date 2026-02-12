/**
 * Bundle the backend into a single file for Electron distribution.
 * Native modules and large SDKs are kept external.
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['backend/src/server.ts'],
  bundle: true,
  outfile: 'backend/dist/server-entry.js',
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: [
    // Native modules (require electron-rebuild)
    'serialport',
    '@serialport/*',
    // Large SDKs kept external (installed in app node_modules)
    '@anthropic-ai/claude-agent-sdk',
    '@anthropic-ai/sdk',
    'simple-git',
    // Node built-ins
    'node:*',
  ],
  banner: {
    js: [
      '// Bundled by esbuild for Electron distribution',
      'import { createRequire } from "node:module";',
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
});

console.log('Backend bundled -> backend/dist/server-entry.js');
