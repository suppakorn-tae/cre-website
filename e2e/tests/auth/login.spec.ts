import { expect, test } from '@playwright/test';
import { PASSWORD, USER } from '../../helpers/env';
import { authText, logInThroughUi, newUser, shellText } from './support';

test.describe('log in and out (UC-02)', () => {
  test('log in, then log out', async ({ page }) => {
    const who = await newUser('login');
    await logInThroughUi(page, who.email, who.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);

    // Signed-in pages render (no 500); /dashboard has no page yet.
    await page.goto('/projects');
    // Log out through the account menu.
    await page.getByRole('button', { name: shellText('account.menuLabel') }).click();
    await page.getByRole('menuitem', { name: shellText('account.logout') }).click();
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login/);
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
