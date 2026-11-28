import { expect, test } from '../helpers/test';

// IO-277: the detail table keeps its header in view while scrolling and stays reachable
// sideways just above the card breakpoint (WCAG 1.4.10).

const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const URL = `/projects/${PROJECT}/versions/${V3}/results?tab=table`;

test('header stays visible while the table scrolls (1440px)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL);
  const wrap = page.locator('table').locator('xpath=..');
  const head = page.locator('thead th').first();
  await expect(head).toBeVisible();
  await wrap.evaluate((el) => {
    el.scrollTop = 600;
  });
  await expect.poll(() => wrap.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const [wrapBox, headBox] = await Promise.all([wrap.boundingBox(), head.boundingBox()]);
  // The header is pinned to the top edge of the scrolled wrapper.
  expect(Math.abs((headBox?.y ?? 0) - ((wrapBox?.y ?? 0) + 1))).toBeLessThan(3);
});

test('the level column is reachable at 800px by scrolling the wrapper', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(URL);
  const wrap = page.locator('table').locator('xpath=..');
  await expect(page.locator('thead th').last()).toBeAttached();
  await wrap.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const [wrapBox, lastBox] = await Promise.all([
    wrap.boundingBox(),
    page.locator('thead th').last().boundingBox(),
  ]);
  expect((lastBox?.x ?? 0) + (lastBox?.width ?? 0)).toBeLessThanOrEqual(
    (wrapBox?.x ?? 0) + (wrapBox?.width ?? 0) + 1,
  );
  expect(lastBox?.x ?? -1).toBeGreaterThanOrEqual(wrapBox?.x ?? 0);
  // The page itself does not scroll sideways.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(800);
});
