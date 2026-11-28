import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { expect, test } from '../helpers/test';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('../../web/node_modules/axe-core/axe.min.js'),
  'utf8',
);

// Ids of the sample project and its versions in web/src/features/versions/mocks.ts.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const RESULTS = `/projects/${PROJECT}/versions/${V3}/results`;

const VH = /^VH - ความเสี่ยงสูงมาก จำนวน: \d+ \(\d+\.\d%\)$/;

test.describe('overview donut tooltip', () => {
  test('hover grows a segment and shows level, count and share', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a touch screen has no hover; focus covers it (next test)');
    await page.goto(RESULTS);
    const arc = page.getByRole('img', { name: VH });
    await expect(arc).toBeVisible();
    const width = () => arc.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));
    const before = await width();
    // VH is the first arc, a thin slice just right of 12 o'clock: aim at its middle.
    const box = (await page.locator('svg[role="group"]').first().boundingBox())!;
    const share = Number(/\((\d+\.\d)%\)/.exec((await arc.getAttribute('aria-label')) ?? '')?.[1]);
    const angle = ((share / 2) * 2 * Math.PI) / 100;
    const r = (15.9155 / 44) * box.width;
    await page.mouse.move(
      box.x + box.width / 2 + r * Math.sin(angle),
      box.y + box.height / 2 - r * Math.cos(angle),
    );
    await expect(arc).toHaveAttribute('data-active', '');
    await expect.poll(width).toBeGreaterThan(before);
    await expect(page.getByRole('tooltip').getByText(/^จำนวน: \d+ \(\d+\.\d%\)$/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('keyboard focus shows the same tooltip', async ({ page }) => {
    await page.goto(RESULTS);
    await page.getByRole('img', { name: VH }).focus();
    await expect(page.getByRole('tooltip').getByText(/^VH - ความเสี่ยงสูงมาก$/)).toBeVisible();
  });

  test('tabbing to a segment draws a ring along the arc, and axe passes', async ({ page }) => {
    await page.goto(RESULTS);
    const arc = page.getByRole('img', { name: VH });
    await expect(arc).toBeVisible();
    await expect(page.locator('[data-focus-ring]')).toHaveCount(0);
    await arc.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab'); // keyboard focus, so :focus-visible matches
    await expect(arc).toBeFocused();
    await expect(page.locator('[data-focus-ring]')).toHaveCount(2);
    // The default box outline is off.
    expect(await arc.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
    await page.evaluate(axeSource);
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run(
              c: Element,
              o: { rules: Record<string, { enabled: boolean }> },
            ): Promise<{ violations: { id: string }[] }>;
          };
        }
      ).axe;
      // The chart with its ring; page-level rules (landmark regions) are not about the ring.
      const chart = document.querySelector('svg[role="group"]')!.parentElement!;
      const r = await axe.run(chart, { rules: { region: { enabled: false } } });
      return r.violations.map((v) => v.id);
    });
    expect(violations).toEqual([]);
    await arc.blur();
    await expect(page.locator('[data-focus-ring]')).toHaveCount(0);
  });
});
