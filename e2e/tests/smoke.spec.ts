import { expect, test } from '../helpers/test';
import { Api, loggedIn } from '../helpers/api';
import { USER } from '../helpers/env';

test('healthz answers 200 through Caddy', async ({ request }) => {
  const res = await request.get('/api/v1/healthz');
  expect(res.status()).toBe(200);
});

test('log-in page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('sign-up by OTP from Mailpit, then the seeded user logs in', async () => {
  const email = `smoke.${Date.now()}.${Math.random().toString(16).slice(2, 8)}@example.com`;
  const fresh = await Api.create();
  expect(await fresh.register({ email, password: USER.password })).toBe(true);
  expect((await fresh.get('/auth/me')).status()).toBe(200);
  await fresh.dispose();

  const seeded = await loggedIn(USER);
  expect((await seeded.get('/auth/me')).status()).toBe(200);
  await seeded.dispose();
});
