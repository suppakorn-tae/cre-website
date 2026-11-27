import { expect, test } from '@playwright/test';

import { expectNoViolations } from '../helpers/a11y';

// Dark mode of the assessment and plan pages (IO-258), on the mock api. The theme is
// chosen the way the switch stores it: localStorage `cre-theme`. axe checks colour
// contrast; the strategy hover from IO-252 must still grow a card in dark.
// Set SHOTS_DIR to also write a screenshot of each page.

const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const assess = `/projects/${PROJECT}/versions/${V3}/assess`;
const plan = `/projects/${PROJECT}/versions/${V3}/plan`;

test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('cre-theme', 'dark'));
});

async function shot(
  page: import('@playwright/test').Page,
  name: string,
  info: { project: { name: string } },
) {
  const dir = process.env.SHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}-${info.project.name}.png` });
}

test('the assessment page is dark and passes axe colour contrast', async ({ page }, info) => {
  await page.goto(assess);
  await expect(page.getByText('ตอบครบ 55 จาก 55 ตัวชี้วัด')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoViolations(page, 'assessment dark');
  await shot(page, 'assessment', info);
});

test('the y3 picker is dark and passes axe colour contrast', async ({ page, isMobile }, info) => {
  await page.goto(assess);
  await expect(page.getByText('ตอบครบ 55 จาก 55 ตัวชี้วัด')).toBeVisible();
  const trigger = page.locator('button[aria-haspopup="dialog"]:visible').first();
  if (isMobile) {
    // On a phone the groups are collapsed cards: open them until a y3 button shows.
    const closed = page.locator('button[aria-expanded="false"]:not([aria-haspopup]):visible');
    for (let i = 0; i < 12 && !(await trigger.isVisible()); i++) {
      await closed.first().click();
    }
  }
  await trigger.click();
  // On a phone this is the modal bottom sheet with a scrim backdrop.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoViolations(page, 'y3 picker dark');
  await shot(page, 'assessment-y3', info);
});

test('the plan page is dark and passes axe colour contrast', async ({ page }, info) => {
  await page.goto(plan);
  await expect(page.getByRole('radiogroup')).toHaveCount(1);
  await page.getByRole('radiogroup').locator('label').filter({ hasText: 'REDUCE' }).click();
  await expect(page.getByRole('radio', { name: /REDUCE/ })).toBeChecked();
  await expectNoViolations(page, 'plan dark');
  await shot(page, 'plan', info);
});

test.describe('strategy card hover in dark', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('hovering one card still grows it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'there is no hover on touch');
    await page.goto(plan);
    const cards = page.getByRole('radiogroup').locator('label');
    await expect(cards).toHaveCount(4);
    const before = (await cards.nth(1).boundingBox())!.width;
    await cards.nth(1).hover();
    await expect
      .poll(async () => ((await cards.nth(1).boundingBox())?.width ?? 0) > before)
      .toBe(true);
  });
});
