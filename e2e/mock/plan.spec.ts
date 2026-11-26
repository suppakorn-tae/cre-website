import { expect, test } from '@playwright/test';

// Ids of the sample project and its versions in web/src/features/versions/mocks.ts.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const V2 = '0193a5c2-0000-7000-8000-000000000102';
const plan = (v: string) => `/projects/${PROJECT}/versions/${v}/plan`;

test('the plan opens the first item and saves a strategy on change', async ({ page }) => {
  await page.goto(plan(V3));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('คำแนะนำจัดการความเสี่ยง – v3');
  // Only the first item is open: one radio group.
  const group = page.getByRole('radiogroup');
  await expect(group).toHaveCount(1);
  await expect(page.locator('button[aria-expanded="true"]')).toHaveCount(1);

  const reduce = group.getByRole('radio', { name: /REDUCE/ });
  await reduce.click();
  await expect(reduce).toBeChecked();
  await expect(page.getByText(/^บันทึกแล้ว/)).toBeVisible();
  // The header counts the saved choice.
  await expect(page.getByText(/เลือกกลยุทธ์แล้ว \d+ \/ 13/)).toBeVisible();
});

test('the radio cards follow radio-group keyboard behaviour', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard behaviour is the same on mobile');
  await page.goto(plan(V3));
  const group = page.getByRole('radiogroup');
  const reduce = group.getByRole('radio', { name: /REDUCE/ });
  await reduce.focus();
  await page.keyboard.press('Space');
  await expect(reduce).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: /TRANSFER/ })).toBeChecked();
  await expect(group.getByRole('radio', { name: /TRANSFER/ })).toBeFocused();
});

test('items open and close, and the rest of the list expands', async ({ page }) => {
  await page.goto(plan(V3));
  const triggers = page.locator('button[aria-expanded]').filter({ hasText: 'RM' });
  await expect(triggers).toHaveCount(6);
  await triggers.nth(1).click();
  await expect(page.getByRole('radiogroup')).toHaveCount(2);
  await triggers.nth(1).click();
  await expect(page.getByRole('radiogroup')).toHaveCount(1);

  await page.getByRole('button', { name: /… และอีก 7 รายการ/ }).click();
  await expect(page.locator('button[aria-expanded]').filter({ hasText: 'RM' })).toHaveCount(13);
});

test('an older version is read only: a chip and a note, no radios', async ({ page }) => {
  await page.goto(plan(V2));
  await expect(page.getByText('เวอร์ชันนี้อ่านอย่างเดียว')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'กลยุทธ์ที่เลือกไว้' })).toBeVisible();
});

test('the H / VH tab is a summary that links to the plan', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V3}/results?tab=hvh`);
  const panel = page.getByRole('tabpanel');
  await expect(panel).toContainText('พบ 13 ตัวชี้วัดที่ต้องจัดการความเสี่ยง');
  await expect(panel.getByRole('radio')).toHaveCount(0);
  await expect(panel.getByRole('listitem').filter({ hasText: 'RM' })).toHaveCount(3);

  await panel.getByRole('link', { name: 'ไปยังแผนจัดการความเสี่ยง' }).click();
  await expect(page).toHaveURL(new RegExp(`${plan(V3)}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('คำแนะนำจัดการความเสี่ยง');
});

test('the results header button opens the plan page', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V3}/results`);
  await page.getByRole('link', { name: /คำแนะนำ & กลยุทธ์/ }).click();
  await expect(page).toHaveURL(new RegExp(`${plan(V3)}$`));
});

test('the plan page fits a phone and a tablet without sideways scroll', async ({ page }) => {
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(plan(V3));
    await expect(page.getByRole('radiogroup')).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, `${width}px`).toBe(false);
  }
});
