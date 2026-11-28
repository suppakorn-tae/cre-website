import { expect, test, type Locator } from '../helpers/test';

// WCAG 2.5.8 (AA): a target is at least 24 x 24 CSS px, or has the spacing to
// spare. These are the controls that were 20 to 23 px high in the audit
// (IO-209). Inline links inside a sentence are exempt by the criterion and are
// not measured here.
const MIN = 24;
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';

async function expectTarget(loc: Locator) {
  await expect(loc.first()).toBeVisible();
  for (const el of await loc.all()) {
    const box = await el.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(MIN);
  }
}

for (const width of [375, 1280]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('the assessment group toggles are at least 24 px', async ({ page }) => {
      await page.goto(`/projects/${PROJECT}/versions/${V3}/assess`);
      // The card toggles of the narrow layout are full width and not group toggles.
      const toggles = page.locator('button[aria-expanded]:has(> svg + span)');
      await expectTarget(toggles);
      expect(await toggles.count()).toBeGreaterThanOrEqual(13);
    });

    test('the versions panel link buttons are at least 24 px', async ({ page }) => {
      await page.goto(`/projects/${PROJECT}`);
      await expectTarget(page.getByRole('button', { name: 'สร้างเวอร์ชันใหม่' }));
      await expectTarget(page.getByRole('button', { name: /ดูทั้งหมดในแท็บเวอร์ชัน/ }));
    });

    test('the forgot password link and the back link of the reset page are 24 px', async ({
      page,
    }) => {
      await page.goto('/login');
      await expectTarget(page.getByRole('link', { name: 'ลืมรหัสผ่าน?' }));
      await page.goto('/forgot-password');
      await expectTarget(page.locator('main a, form a, a').filter({ hasText: /เข้าสู่ระบบ/ }).first());
    });

    test('the back link of the legal pages is at least 24 px', async ({ page }) => {
      for (const path of ['/legal/terms', '/legal/retention']) {
        await page.goto(path);
        await expectTarget(page.locator('main > a').first());
      }
    });
  });
}
