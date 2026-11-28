import { expect, guardedContext, test } from '../../helpers/test';
import { Api, loggedIn } from '../../helpers/api';
import { clearMail, readOtp } from '../../helpers/mailpit';
import { authText, logInThroughUi, NEW_PASSWORD, newUser, typeOtp } from './support';

test.describe('forgot password (UC-03)', () => {
  test('OTP and a new password end the sessions on other devices', async ({ page, browser }) => {
    const who = await newUser('reset');

    // A session on another device (second browser context).
    const other = await guardedContext(browser);
    const otherPage = await other.newPage();
    await logInThroughUi(otherPage, who.email, who.password);
    await expect(otherPage).toHaveURL(/\/dashboard$/);
    expect((await other.request.get('/api/v1/auth/me')).status()).toBe(200);

    // Reset through the UI.
    await clearMail(who.email);
    await page.goto('/forgot-password');
    await page.locator('input[type="email"]').fill(who.email);
    await page.getByRole('button', { name: authText('reset.email.submit') }).click();
    await expect(page.getByRole('heading', { name: authText('reset.form.title') })).toBeVisible();

    await typeOtp(page, await readOtp(who.email));
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill(NEW_PASSWORD);
    await passwords.nth(1).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: authText('reset.form.submit') }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole('status').filter({ hasText: authText('login.resetDone') }),
    ).toBeVisible();

    // The old session is gone: API answers 401, the other device is signed out.
    expect((await other.request.get('/api/v1/auth/me')).status()).toBe(401);
    // Revisiting a signed-in page on that device redirects to log in.
    await otherPage.goto('/projects');
    await expect(otherPage).toHaveURL(/\/login/);
    await other.close();

    // The old password no longer works; the new one does.
    const api = await Api.create();
    expect(
      (await api.post('/auth/login', { email: who.email, password: who.password })).status(),
    ).toBe(401);
    await api.dispose();
    const fresh = await loggedIn({ email: who.email, password: NEW_PASSWORD });
    expect((await fresh.get('/auth/me')).status()).toBe(200);
    await fresh.dispose();
  });

  test('a wrong code leaves the password unchanged', async ({ page }) => {
    const who = await newUser('resetbad');
    await clearMail(who.email);
    await page.goto('/forgot-password');
    await page.locator('input[type="email"]').fill(who.email);
    await page.getByRole('button', { name: authText('reset.email.submit') }).click();
    await expect(page.getByRole('heading', { name: authText('reset.form.title') })).toBeVisible();

    const real = await readOtp(who.email);
    await typeOtp(page, real === '000000' ? '111111' : '000000');
    const passwords = page.locator('input[type="password"]');
    await passwords.nth(0).fill(NEW_PASSWORD);
    await passwords.nth(1).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: authText('reset.form.submit') }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: authText('reset.form.errors.otpBad') }),
    ).toBeVisible();

    const api = await loggedIn(who);
    expect((await api.get('/auth/me')).status()).toBe(200);
    await api.dispose();
  });
});
