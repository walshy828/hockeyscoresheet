import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:8787', ...devices['Pixel 7'], serviceWorkers: 'allow' },
});
