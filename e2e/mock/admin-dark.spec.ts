import { expect, test } from '@playwright/test';

// The admin pages in dark mode, on the mock api: the theme is applied, and no
// visible element keeps a pure white fill (a card or table left on the light
// token). Contrast of the token pairs is covered in web/src/lib/contrast.test.ts.

const PAGES: { name: string; path: string; ready: string }[] = [
  { name: 'users', path: '/admin/users', ready: 'จัดการผู้ใช้' },
  { name: 'thresholds', path: '/admin/thresholds', ready: 'เกณฑ์ RL (a–e)' },
  { name: 'impact thresholds', path: '/admin/impact-thresholds', ready: 'เกณฑ์ผลกระทบ' },
  { name: 'advice', path: '/admin/advice', ready: 'คำแนะนำตัวชี้วัด' },
  { name: 'audit', path: '/admin/audit', ready: 'บันทึกการกระทำ' },
  { name: 'export', path: '/admin/export', ready: 'ส่งออกข้อมูลวิจัย' },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cre-theme', 'dark');
    } catch {
      /* storage blocked: the test then fails on data-theme, which is the point */
    }
  });
});

for (const { name, path, ready } of PAGES) {
  test(`admin ${name}: dark theme, no white fills`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText(ready).and(page.locator(':visible')).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const white = await page.evaluate(() =>
      [...document.body.querySelectorAll<HTMLElement>('*')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        })
        .filter((el) => getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)')
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`),
    );
    expect(white).toEqual([]);
  });
}
