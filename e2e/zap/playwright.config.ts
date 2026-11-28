import { defineConfig } from '@playwright/test';
import { BASE_URL } from '../playwright.config';

// Signs in as the e2e seed user for the ZAP scan (scan.sh). Not part of `pnpm test`.
export default defineConfig({
  testDir: '.',
  testMatch: 'session.spec.ts',
  globalSetup: '../global-setup.ts',
  reporter: 'list',
  use: { baseURL: BASE_URL, ignoreHTTPSErrors: true },
});
