import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { expect, test, type Page } from '@playwright/test';

// Dark mode of the shell, auth, account and legal pages (IO-256), on the mock api: the theme
// switch works, the page uses the dark palette (docs/specs/ux-ui/feedback/2026-11-27/dark-palette.md)
// and axe finds no colour-contrast failure. axe-core comes from web/node_modules.

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('../../web/node_modules/axe-core/axe.min.js'),
  'utf8',
);

interface Axe {
  run(
    context: string | Document,
    options: { runOnly: { type: 'rule'; values: string[] } },
  ): Promise<{ violations: { id: string; nodes: { html: string; any: unknown[] }[] }[] }>;
}

async function contrastProblems(page: Page, scope: string) {
  await page.evaluate(axeSource);
  return page.evaluate(async (sel) => {
    const axe = (window as unknown as { axe: Axe }).axe;
    const r = await axe.run(sel, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    return r.violations.flatMap((v) => v.nodes.map((n) => n.html.slice(0, 140)));
  }, scope);
}

const bg = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);

test.beforeEach(async ({ page }) => {
  // Dark through the system setting, as for a visitor who has never picked a theme.
  await page.emulateMedia({ colorScheme: 'dark' });
});

const PAGES = [
  { name: 'login', path: '/login', ready: /เข้าสู่ระบบ/, scope: 'body', canvas: 'main' },
  { name: 'dashboard shell', path: '/dashboard', ready: /การกระจายระดับความเสี่ยง/, scope: 'header' },
  { name: 'account', path: '/account', ready: 'วิธีเข้าสู่ระบบ', scope: 'body' },
  { name: 'terms', path: '/legal/terms', ready: 'เงื่อนไขการใช้งาน', scope: 'body' },
];

for (const p of PAGES) {
  test(`${p.name} in dark mode: dark palette and contrast`, async ({ page }) => {
    await page.goto(p.path);
    await expect(page.getByText(p.ready).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Canvas #0b1320 or surface #111b2b of the palette, never white.
    const body = await bg(page, 'html');
    expect(body).toBe('rgb(11, 19, 32)');
    expect(await contrastProblems(page, p.scope)).toEqual([]);
  });
}

test('the account menu switches the theme and keeps it after a reload', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'same menu on mobile');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/account');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'เมนูบัญชี' }).click();
  await page.getByRole('menuitemradio', { name: 'มืด' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('menuitemradio', { name: 'มืด' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the auth pages have a theme button in the corner', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/login');
  await page.getByRole('button', { name: 'เปลี่ยนธีม' }).click();
  await page.getByRole('menuitemradio', { name: 'มืด' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(page.locator('main')).toBeVisible();
});

test('system mode follows the OS live on a page with no switch', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/legal/terms');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
