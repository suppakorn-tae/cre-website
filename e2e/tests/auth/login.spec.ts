import { expect, test } from '@playwright/test';
import { PASSWORD, USER } from '../../helpers/env';
import { authText, logInThroughUi, newUser } from './support';

test.describe('log in and out (UC-02)', () => {
  test('log in, then log out', async ({ page }) => {
    const who = await newUser('login');
    await logInThroughUi(page, who.email, who.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);

    // Log out through the API: signed-in pages answer 500 on the production
    // build (the server guard calls API_INTERNAL_URL=http://api:4000 without
    // /api/v1 and gets 404), so the account menu cannot render yet.
    const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()) as {
      csrf_token: string;
    };
    const out = await page.request.post('/api/v1/auth/logout', {
      headers: { 'X-CSRF-Token': csrf.csrf_token },
    });
    expect(out.ok()).toBe(true);
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('a wrong password is refused and shows the error', async ({ page }) => {
    await logInThroughUi(page, USER.email, `${PASSWORD}-wrong`);
    await expect(
      page.getByRole('alert').filter({ hasText: authText('login.errors.invalidTitle') }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('keep me logged in sets a persistent session cookie', async ({ page }) => {
    const sessionCookie = async () =>
      (await page.context().cookies()).find((c) => c.name === 'cre_session');

    await logInThroughUi(page, USER.email, USER.password, true);
    await expect(page).toHaveURL(/\/dashboard$/);
    const kept = await sessionCookie();
    expect(kept?.expires).toBeGreaterThan(Date.now() / 1000 + 24 * 3600);

    await page.context().clearCookies();
    await logInThroughUi(page, USER.email, USER.password, false);
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await sessionCookie())?.expires).toBe(-1);
  });
});
