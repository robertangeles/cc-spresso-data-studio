import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/*.integration.test.{ts,js}', 'dist/**', 'node_modules/**'],
  },
});
