import { defineConfig, devices } from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'https://localhost';

export default defineConfig({
  testDir: './tests',
  // tests/a11y runs in mock mode only (playwright.mock.config.ts).
  testIgnore: ['a11y/**'],
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // Caddy issues the localhost certificate from its internal CA.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
