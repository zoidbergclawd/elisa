import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/**/*.test.ts',
        'src/test-setup.ts',
      ],
      thresholds: {
        lines: 50,
      },
    },
  },
})
