import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run test files sequentially to avoid port conflicts
    // when multiple files start real HTTP servers.
    fileParallelism: false,
    // Exclude compiled output from test discovery
    exclude: ['dist/**', 'node_modules/**'],
  },
});
