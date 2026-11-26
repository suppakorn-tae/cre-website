import { expect, test } from '@playwright/test';

// The user menu is a Radix menu, so the keyboard works without any code of ours.
test('the user menu opens, moves with the arrow keys and closes with Esc', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard behaviour is the same on mobile');
  await page.goto('/account');
  const trigger = page.getByRole('button', { name: 'เมนูบัญชี' });
  await trigger.focus();
  await page.keyboard.press('Enter');

  const items = page.getByRole('menuitem');
  await expect(items).toHaveText(['บัญชีของฉัน', 'ผู้ดูแลระบบ', 'ออกจากระบบ']);
  await expect(items.first()).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('the password toggle shows and hides the password', async ({ page }) => {
  await page.goto('/login');
  const input = page.locator('input[autocomplete="current-password"]');
  await input.fill('secret123');
  await expect(input).toHaveAttribute('type', 'password');

  const show = page.getByRole('button', { name: 'แสดงรหัสผ่าน' });
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  await show.click();
  await expect(input).toHaveAttribute('type', 'text');

  const hide = page.getByRole('button', { name: 'ซ่อนรหัสผ่าน' });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await hide.click();
  await expect(input).toHaveAttribute('type', 'password');
});
