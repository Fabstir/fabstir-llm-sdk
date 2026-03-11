import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.bak/**', '**/src.bak/**', '**/test.bak/**'],
  },
});
