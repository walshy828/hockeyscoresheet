import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['shared/**/*.test.ts', 'web/**/*.test.ts'], exclude: ['**/node_modules/**'] },
});
