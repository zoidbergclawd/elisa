import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/test-setup.ts',
      ],
      thresholds: {
        lines: 50,
      },
    },
  },
})
