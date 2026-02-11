import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    globalSetup: 'tests/globalSetup.ts',
    globalTeardown: 'tests/globalTeardown.ts',
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts'
      ]
    },
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist']
  }
});
