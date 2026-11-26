import { expect, test, type Page } from '@playwright/test';

// The sample project; v3 is submitted with every answer, so it can be submitted again.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const ASSESS = `/projects/${PROJECT}/versions/${V3}/assess`;
const RESULTS = `/projects/${PROJECT}/versions/${V3}/results`;

const stepper = (page: Page) => page.getByRole('navigation', { name: 'ขั้นตอนการประเมิน' });
const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'ส่งผลการประเมินหรือไม่' });
const submitButton = (page: Page) => page.getByRole('button', { name: 'ส่งผลการประเมิน' }).first();

async function submit(page: Page) {
  await submitButton(page).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'ส่งผลการประเมิน' }).click();
  await expect(page).toHaveURL(new RegExp(`${RESULTS}$`));
}

/** The results page takes real clicks, and step 2 opens with the confirm box closed. */
async function resultsRespond(page: Page) {
  await expect(dialog(page)).toHaveCount(0);
  const back = stepper(page).getByRole('link', { name: 'ประเมินความเสี่ยง' });
  await expect(back).toBeVisible();
  // No open modal dialog anywhere (a hidden one still makes the page inert).
  expect(await page.evaluate(() => document.querySelector('dialog[open]') === null)).toBe(true);
  await back.click({ timeout: 5_000 });
  await expect(page).toHaveURL(new RegExp(`${ASSESS}$`));
  await expect(submitButton(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  // The page under the bar responds too.
  await submitButton(page).click({ timeout: 5_000 });
  await expect(dialog(page)).toBeVisible();
}

test('after submit the results page responds and step 2 has no dialog', async ({ page }) => {
  await page.goto(ASSESS);
  await submit(page);
  await resultsRespond(page);
});

for (let run = 1; run <= 10; run++) {
  test(`after a reload before submit the results page responds (run ${run})`, async ({ page }) => {
    await page.goto(ASSESS);
    await expect(submitButton(page)).toBeEnabled();
    await page.reload();
    await expect(submitButton(page)).toBeEnabled();
    await submit(page);
    await resultsRespond(page);
  });
}
