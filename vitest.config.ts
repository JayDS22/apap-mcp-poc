import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/config.ts'],
      thresholds: {
        // Service layer must maintain 90%+ coverage
        'src/services/': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        // Handlers need 85%+ coverage
        'src/handlers/': {
          statements: 85,
          branches: 80,
          functions: 85,
          lines: 85,
        },
      },
    },
    // Increase timeout for integration tests that spin up real Postgres
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
