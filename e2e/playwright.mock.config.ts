import { defineConfig, devices } from '@playwright/test';

// Mock mode: the web app alone, answered by MSW and the mock session. No
// compose stack, no api, no seeded users. Run with `pnpm run test:mock`.
const PORT = Number(process.env.E2E_MOCK_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './mock',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    // CRE_MOCK_ROLE=admin makes the mock session an admin, who can also open
    // every signed-in page, so one server covers the app and the admin area.
    command: `pnpm --dir ../web exec next dev -p ${PORT}`,
    url: `${BASE_URL}/healthz`,
    env: { NEXT_PUBLIC_API_MOCKS: '1', CRE_MOCK_ROLE: 'admin' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
