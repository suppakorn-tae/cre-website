import { expect, test, type Page } from '@playwright/test';

// The sample project (web/src/features/versions/mocks.ts): v3 is submitted, v1 is a draft.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const V1 = '0193a5c2-0000-7000-8000-000000000101';

const stepper = (page: Page) => page.getByRole('navigation', { name: 'ขั้นตอนการประเมิน' });

test('from the results page the step before leads back to that version’s assessment', async ({
  page,
}) => {
  await page.goto(`/projects/${PROJECT}/versions/${V3}/results`);
  await expect(stepper(page).locator('[aria-current="step"]')).toContainText('ผลการประเมิน');
  await stepper(page).getByRole('link', { name: 'ประเมินความเสี่ยง' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT}/versions/${V3}/assess$`));
  // The current step is not a link; the way forward is.
  await expect(stepper(page).getByRole('link', { name: 'ผลการประเมิน' })).toHaveAttribute(
    'href',
    `/projects/${PROJECT}/versions/${V3}/results`,
  );
});

test('step 1 opens the project form', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on a phone only the neighbours of the current step show');
  await page.goto(`/projects/${PROJECT}/versions/${V3}/results`);
  await stepper(page).getByRole('link', { name: 'ข้อมูลโครงการ' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT}/edit$`));
  // The form page has the indicator too, pointing at the latest version.
  await expect(stepper(page).locator('[aria-current="step"]')).toContainText('ข้อมูลโครงการ');
  await expect(stepper(page).getByRole('link', { name: 'ประเมินความเสี่ยง' })).toHaveAttribute(
    'href',
    new RegExp(`/projects/${PROJECT}/versions/.+/assess$`),
  );
});

test('a draft version cannot open results, plan or report yet', async ({ page, isMobile }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V1}/assess`);
  const results = stepper(page).getByRole('link', { name: 'ผลการประเมิน' });
  await expect(results).toHaveAttribute('aria-disabled', 'true');
  await expect(results).not.toHaveAttribute('href');
  await expect(results).toHaveAccessibleDescription('ส่งผลการประเมินก่อน');
  if (!isMobile) {
    await expect(stepper(page).getByRole('button', { name: 'รายงาน' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  }
});

test('step 5 builds the report in place and the PDF downloads', async ({ page }) => {
  const path = `/projects/${PROJECT}/versions/${V3}/plan`;
  await page.goto(path);
  const report = stepper(page).getByRole('button', { name: 'รายงาน' });
  await expect(report).toBeEnabled();

  const download = page.waitForEvent('download', { timeout: 15_000 });
  await report.click();
  await expect(stepper(page).getByRole('button', { name: 'กำลังสร้าง…' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect((await download).suggestedFilename()).toBe('CRE-TK2-v3.pdf');
  await expect(stepper(page).getByRole('button', { name: 'ดาวน์โหลดแล้ว' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(path);
});
