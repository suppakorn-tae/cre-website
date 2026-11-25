import { expect, test } from '@playwright/test';
import { Api } from '../../helpers/api';
import { PASSWORD } from '../../helpers/env';
import { readOtp } from '../../helpers/mailpit';
import { authText, fillSignUp, typeOtp, uniqueEmail, wrongOtp } from './support';

test.describe('sign-up (UC-01)', () => {
  test('e-mail, OTP from Mailpit, then the signed-in app', async ({ page }) => {
    const email = uniqueEmail('signup');
    await fillSignUp(page, email, PASSWORD);
    await typeOtp(page, await readOtp(email));
    await page.getByRole('button', { name: authText('register.otp.submit') }).click();
    await expect(page).toHaveURL(/\/(projects\/new|dashboard)$/);

    const me = await page.request.get('/api/v1/auth/me');
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { user: { email: string } }).user.email).toBe(email);
  });

  test('the sixth wrong code cancels the pending sign-up', async ({ page }) => {
    const email = uniqueEmail('wrongotp');
    await fillSignUp(page, email, PASSWORD);
    const real = await readOtp(email);
    const bad = wrongOtp(real);
    const submit = page.getByRole('button', { name: authText('register.otp.submit') });
    const alert = (key: string) =>
      page.getByRole('alert').filter({ hasText: authText(`register.otp.errors.${key}`) });

    // Five wrong codes are tolerated: each clears the boxes and shows an error.
    const boxes = page.getByRole('group').locator('input');
    for (let tried = 1; tried <= 5; tried++) {
      await typeOtp(page, bad);
      await submit.click();
      await expect(page.getByRole('alert').filter({ hasText: /\S/ }).first()).toBeVisible();
      await expect(boxes.first()).toHaveValue('');
    }
    // The sixth wrong code makes the api drop the pending sign-up.
    await typeOtp(page, bad);
    await submit.click();
    await expect(alert('locked')).toBeVisible();

    // The pending sign-up is gone: even the right code no longer works.
    await typeOtp(page, real);
    await submit.click();
    await expect(alert('noPending')).toBeVisible();

    const api = await Api.create();
    const login = await api.post('/auth/login', { email, password: PASSWORD });
    expect(login.status()).toBe(401);
    await api.dispose();
  });

  test('resend is blocked during the cool-down', async ({ page }) => {
    const email = uniqueEmail('cooldown');
    await fillSignUp(page, email, PASSWORD);

    // The UI shows the countdown instead of a resend button.
    await expect(page.getByText(authText('register.otp.resendWait'))).toBeVisible();
    await expect(page.getByRole('button', { name: authText('register.otp.resend') })).toHaveCount(
      0,
    );

    // The API refuses a resend and a second start with 429 and Retry-After.
    const api = await Api.create();
    const again = await api.post('/auth/register/resend', { email });
    expect(again.status()).toBe(429);
    expect(Number(again.headers()['retry-after'])).toBeGreaterThan(0);
    const restart = await api.post('/auth/register/start', {
      email,
      password: PASSWORD,
      password_confirmation: PASSWORD,
      retention_accepted: true,
      terms_accepted: true,
    });
    expect(restart.status()).toBe(429);
    await api.dispose();
  });
});
