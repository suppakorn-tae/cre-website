import { expect, test } from '@playwright/test';

import { expectNoViolations } from '../helpers/a11y';

// Dark mode of the dashboard, projects, versions and the report button (IO-257), on the
// mock api. The theme is set through the stored choice the theme script reads (IO-255).

const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';

const PAGES: { name: string; path: string; ready: string }[] = [
  { name: 'dashboard', path: '/dashboard', ready: 'การกระจายระดับความเสี่ยง' },
  { name: 'projects', path: '/projects', ready: 'ท่าเรือเกาะเต่า ระยะที่ 2' },
  { name: 'new project', path: '/projects/new', ready: 'สร้างโครงการก่อสร้างใหม่' },
  { name: 'project overview', path: `/projects/${PROJECT}`, ready: 'เวอร์ชันล่าสุด' },
  { name: 'versions', path: `/projects/${PROJECT}?tab=versions`, ready: 'แนวโน้มข้ามเวอร์ชัน' },
];

test.use({ colorScheme: 'dark' });
test.setTimeout(90_000);

for (const { name, path, ready } of PAGES) {
  test(`${name} in dark mode passes axe and has no white surface`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cre-theme', 'dark'));
    await page.goto(path);
    await expect(page.getByText(ready).and(page.locator(':visible')).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await expectNoViolations(page, name);
    // No surface is still painted pure white.
    const whites = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.width > 40 &&
            r.height > 20 &&
            getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)'
          );
        })
        .map((e) => e.outerHTML.slice(0, 100)),
    );
    expect(whites).toEqual([]);
    if (process.env.DARK_SHOTS) {
      await page.screenshot({
        path: `${process.env.DARK_SHOTS}/${name.replace(/ /g, '-')}-${page.viewportSize()?.width}.png`,
        fullPage: true,
      });
    }
  });
}
