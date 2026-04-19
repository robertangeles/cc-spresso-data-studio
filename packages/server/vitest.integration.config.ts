import { defineConfig } from 'vitest/config';

/**
 * Integration test config — opt-in. Includes `*.integration.test.ts` files
 * (which the default config excludes), and bumps the timeout to 30s for
 * tests that hit the live server / database.
 *
 * Run with: pnpm exec vitest run --config vitest.integration.config.ts
 */
export default defineConfig({
  test: {
    include: ['**/*.integration.test.{ts,js}'],
    exclude: ['dist/**', 'node_modules/**'],
    testTimeout: 30_000,
  },
});
