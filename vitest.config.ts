import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/server.ts'],
      thresholds: {
        lines: 28,
        branches: 72,
        functions: 32,
        statements: 28,
      },
    },
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
