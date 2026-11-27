import { expect, test, type Page } from '@playwright/test';

// Ids of the sample project and its versions in web/src/features/versions/mocks.ts.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';

const CHARTS = [
  { name: 'dashboard', path: '/dashboard', ready: 'การกระจายระดับความเสี่ยง' },
  { name: 'results', path: `/projects/${PROJECT}/versions/${V3}/results`, ready: 'Heat Map' },
  {
    name: 'versions summary',
    path: `/projects/${PROJECT}?tab=versions`,
    ready: 'แนวโน้มข้ามเวอร์ชัน',
  },
  {
    name: 'versions RM',
    path: `/projects/${PROJECT}?tab=versions&view=rm`,
    ready: 'RM รายตัวชี้วัด',
  },
];

/** Animations and transitions that are running or waiting to run. */
const running = (page: Page) =>
  page.evaluate(() => document.getAnimations().filter((a) => a.playState !== 'finished').length);

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const { name, path, ready } of CHARTS) {
    test(`${name} has no running animation or transition`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText(ready).and(page.locator(':visible')).first()).toBeVisible();
      expect(await running(page)).toBe(0);
    });
  }
});

test.describe('motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('the versions tab charts play an entrance on load, and it ends', async ({ page }) => {
    await page.goto(`/projects/${PROJECT}?tab=versions`);
    await expect(page.getByText('แนวโน้มข้ามเวอร์ชัน').first()).toBeVisible();
    await expect.poll(() => running(page)).toBeGreaterThan(0);
    await expect.poll(() => running(page), { timeout: 5000 }).toBe(0);
  });
});
