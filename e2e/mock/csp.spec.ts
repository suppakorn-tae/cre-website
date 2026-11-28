import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from '../helpers/test';

// Content Security Policy in mock mode (IO-264). Every spec fails on a CSP
// violation through helpers/test.ts; these tests check the guard is in use and
// the parts the other specs do not reach.

const root = join(import.meta.dirname, '..');
const loginText = (
  JSON.parse(readFileSync(join(root, '../web/messages/th/auth.json'), 'utf8')) as {
    login: { google: string };
  }
).login;

function specs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? specs(join(dir, e.name))
      : e.name.endsWith('.spec.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

test('every spec takes `test` from helpers/test, so every page has the CSP guard', () => {
  const unguarded = [...specs(join(root, 'mock')), ...specs(join(root, 'tests'))]
    .filter((f) => /from '@playwright\/test'/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(root, f));
  expect(unguarded).toEqual([]);
});

test('pages carry a nonce-based policy', async ({ page }) => {
  const response = await page.goto('/login');
  const policy = response?.headers()['content-security-policy'] ?? '';
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("worker-src 'self'");
  // The MSW worker is up (mock data loads only through it).
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())))
    .toBe(true);
});

test('Google sign-in still leaves for accounts.google.com', async ({ page }) => {
  // The mock api answers with an accounts.google.com URL; stand in for Google.
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Google</title>' }),
  );
  await page.goto('/login');
  await page.getByRole('button', { name: loginText.google }).click();
  await page.waitForURL(/^https:\/\/accounts\.google\.com\//);
});
