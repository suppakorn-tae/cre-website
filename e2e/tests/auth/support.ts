import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { Api } from '../../helpers/api';
import { PASSWORD } from '../../helpers/env';
import { clearMail } from '../../helpers/mailpit';

type Catalogue = Record<string, unknown>;

const load = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../web/messages/th/${name}.json`, import.meta.url), 'utf8'),
  ) as Catalogue;

const auth = load('auth');
const shell = load('shell');

function pick(source: Catalogue, path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((o, k) => (o as Catalogue | undefined)?.[k], source);
  if (typeof value !== 'string') throw new Error(`missing message ${path}`);
  return value;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A regex for a catalogue message. `{name}` placeholders match any text, so
 * the tests read the Thai strings from web/messages instead of copying them.
 */
function pattern(text: string): RegExp {
  return new RegExp(escape(text).replace(/\\\{\w+\\\}/g, '.+'));
}

export const authText = (path: string) => pattern(pick(auth, path));
export const shellText = (path: string) => pattern(pick(shell, path));

export const uniqueEmail = (tag: string) =>
  `${tag}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}@example.com`;

export const NEW_PASSWORD = 'e2e-New-Password-2';

/** Create a user through the API (OTP from Mailpit) and return its credentials. */
export async function newUser(tag: string) {
  const who = { email: uniqueEmail(tag), password: PASSWORD };
  const api = await Api.create();
  try {
    await api.register(who);
  } finally {
    await api.dispose();
  }
  return who;
}

/** Fill the six OTP boxes by typing all digits into the first one. */
export async function typeOtp(page: Page, code: string) {
  await page.getByRole('group').locator('input').first().fill(code);
}

/** A six-digit code that differs from `real`. */
export const wrongOtp = (real: string) => (real === '000000' ? '111111' : '000000');

/** Walk the sign-up form up to the OTP step. */
export async function fillSignUp(page: Page, email: string, password: string) {
  await page.goto('/register');
  await page.getByRole('button', { name: authText('register.choose.email') }).click();
  await page.locator('input[type="email"]').fill(email);
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill(password);
  await passwords.nth(1).fill(password);
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('checkbox').nth(1).check();
  await clearMail(email);
  await page.getByRole('button', { name: authText('register.form.submit') }).click();
  await expect(page.getByRole('heading', { name: authText('register.otp.title') })).toBeVisible();
}

export async function logInThroughUi(page: Page, email: string, password: string, keep = false) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  if (keep) await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: authText('login.submit') }).click();
}
