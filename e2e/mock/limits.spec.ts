import { expectNoViolations } from '../helpers/a11y';
import { expect, test } from '../helpers/test';

// The project and version limits (IO-281) on the mock api. The mock answers with the limit
// set in localStorage (`cre-mock-max-projects`, `cre-mock-max-versions`), so the at-limit state
// needs no dozens of rows. See web/src/mocks/limits.ts.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const PROJECT_HINT = /สร้างโครงการใหม่ไม่ได้ เพราะมีโครงการครบ 3 โครงการแล้ว/;
const VERSION_HINT = /สร้างเวอร์ชันใหม่ไม่ได้ เพราะโครงการนี้มีเวอร์ชันครบ 3 เวอร์ชันแล้ว/;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('cre-theme', t), theme);
    });

    for (const path of ['/dashboard', '/projects']) {
      test(`${path}: at the project limit the add link is off, focusable and described`, async ({
        page,
      }) => {
        await page.addInitScript(() => localStorage.setItem('cre-mock-max-projects', '3'));
        await page.goto(path);
        const add = page.locator('main').getByRole('link', { name: 'เพิ่มโครงการ', exact: true });
        await expect(add).toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
        // The count and the hint are in the page; a screen reader reads the hint with the link.
        await expect(page.locator('main').getByText(/\/ 3 โครงการ$/)).toBeVisible();
        await expect(add).toHaveAccessibleDescription(PROJECT_HINT);
        await expect(add).toHaveAccessibleDescription(/ลบโครงการที่ไม่ใช้/);
        // Not removed: it takes focus, and Enter does not leave the page.
        await add.focus();
        await expect(add).toBeFocused();
        await page.keyboard.press('Enter');
        // `force`: Playwright treats aria-disabled as not clickable and would wait forever.
        await add.click({ force: true });
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expectNoViolations(page, `${theme} ${path} at the project limit`);
      });
    }

    test('below the project limit the add link works and shows the count', async ({ page }) => {
      await page.goto('/projects');
      const add = page.locator('main').getByRole('link', { name: 'เพิ่มโครงการ', exact: true });
      await expect(page.locator('main').getByText(/^\d+ \/ 50 โครงการ$/)).toBeVisible({
        timeout: 20_000,
      });
      await expect(add).not.toHaveAttribute('aria-disabled', 'true');
      await expect(add).not.toHaveAttribute('aria-describedby', /.+/);
      await add.click();
      await expect(page).toHaveURL(/\/projects\/new$/);
    });

    for (const tab of ['overview', 'versions'] as const) {
      test(`${tab}: at the version limit the new version action is off, focusable and described`, async ({
        page,
      }) => {
        await page.addInitScript(() => localStorage.setItem('cre-mock-max-versions', '3'));
        await page.goto(`/projects/${PROJECT}${tab === 'versions' ? '?tab=versions' : ''}`);
        const action =
          tab === 'versions'
            ? page.getByRole('button', { name: 'เวอร์ชันใหม่', exact: true })
            : page.getByRole('button', { name: 'สร้างเวอร์ชันใหม่', exact: true });
        await expect(action).toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
        await expect(page.getByText('3 / 3 เวอร์ชัน').first()).toBeVisible();
        await expect(action).toHaveAccessibleDescription(VERSION_HINT);
        await action.focus();
        await expect(action).toBeFocused();
        await action.click({ force: true });
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
        await expectNoViolations(page, `${theme} ${tab} at the version limit`);
      });
    }

    test('below the version limit the new version action opens the dialog', async ({ page }) => {
      await page.goto(`/projects/${PROJECT}?tab=versions`);
      const action = page.getByRole('button', { name: 'เวอร์ชันใหม่', exact: true });
      await expect(page.getByText('3 / 10 เวอร์ชัน')).toBeVisible({ timeout: 20_000 });
      await expect(action).not.toHaveAttribute('aria-disabled', 'true');
      await action.click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
    });
  });
}

test('a create refused by the server still shows its message (stale page)', async ({ page }) => {
  // The page loads below the limit; the limit is reached before the create is sent.
  await page.goto(`/projects/${PROJECT}?tab=versions`);
  await expect(page.getByText('3 / 10 เวอร์ชัน')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => localStorage.setItem('cre-mock-max-versions', '3'));
  await page.getByRole('button', { name: 'เวอร์ชันใหม่', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'สร้างเวอร์ชันใหม่', exact: true })
    .click();
  await expect(
    page.getByText(/สร้างเวอร์ชันใหม่ไม่ได้ เพราะโครงการนี้มีเวอร์ชันครบจำนวนสูงสุดแล้ว/),
  ).toBeVisible();
});
