import { expect, test } from '@playwright/test';

// The sample project and its versions (web/src/features/versions/mocks.ts):
// v3 and v2 are submitted, v1 is a draft. The job mock walks queued, running,
// done over successive polls, and fails the first report of v2 so retry can be tried.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const V2 = '0193a5c2-0000-7000-8000-000000000102';

// The file is named CRE-{nickname}-v{no}.pdf by the download link.
const FILE_V3 = 'CRE-TK2-v3.pdf';
const FILE_V2 = 'CRE-TK2-v2.pdf';

const REPORT = 'รายงาน PDF';
const DRAFT_REASON = 'ส่งผลการประเมินก่อนจึงสร้างรายงานได้';
const BUILDING_TITLE = 'กำลังสร้างรายงาน PDF…';
const READY_TITLE = 'รายงานพร้อมแล้ว — กำลังดาวน์โหลด';
const FAILED_TITLE = 'สร้างรายงานไม่สำเร็จ';
// The api builds in 10 to 30 seconds; the mock needs about three seconds of polling.
const BUILD = { timeout: 15_000 };

const toasts = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'การแจ้งเตือน' });

test('the report builds from the results page with a toast and downloads without leaving', async ({
  page,
}) => {
  const path = `/projects/${PROJECT}/versions/${V3}/results`;
  await page.goto(path);
  const button = page.getByRole('button', { name: REPORT, exact: true });
  await expect(button).toBeVisible();

  const download = page.waitForEvent('download', BUILD);
  await button.click();

  // Building: the toast and the button both say so.
  await expect(toasts(page).getByText(BUILDING_TITLE)).toBeVisible();
  await expect(toasts(page).getByText('ใช้เวลาประมาณ 10–30 วินาที')).toBeVisible();
  const busy = page.getByRole('button', { name: 'กำลังสร้าง…' });
  await expect(busy).toHaveAttribute('aria-busy', 'true');

  // Ready: the file is saved, the toast says so, and the page did not change.
  expect((await download).suggestedFilename()).toBe(FILE_V3);
  await expect(toasts(page).getByText(READY_TITLE)).toBeVisible();
  await expect(toasts(page).getByRole('button', { name: 'ดาวน์โหลดอีกครั้ง' }).first()).toBeVisible();
  await expect(toasts(page).getByText(BUILDING_TITLE)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(path);

  // The link in the toast saves the same file again.
  // Pressed with the keyboard: on a phone the dev-only Next badge sits over the toast.
  const again = page.waitForEvent('download');
  await toasts(page).getByRole('button', { name: 'ดาวน์โหลดอีกครั้ง' }).first().press('Enter');
  expect((await again).suggestedFilename()).toBe(FILE_V3);
});

test('a failed report shows an error toast and retry builds it', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V2}/results`);
  await page.getByRole('button', { name: REPORT, exact: true }).click();

  const failed = toasts(page).getByText(FAILED_TITLE);
  await expect(failed).toBeVisible(BUILD);
  await expect(toasts(page).getByText(BUILDING_TITLE)).toHaveCount(0);

  const download = page.waitForEvent('download', BUILD);
  await toasts(page).getByRole('button', { name: 'ลองอีกครั้ง' }).first().press('Enter');
  await expect(toasts(page).getByText(BUILDING_TITLE)).toBeVisible();
  expect((await download).suggestedFilename()).toBe(FILE_V2);
  await expect(toasts(page).getByText(READY_TITLE)).toBeVisible();
});

test('the toast can be dismissed while building', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V3}/results`);
  await page.getByRole('button', { name: REPORT, exact: true }).click();
  await expect(toasts(page).getByText(BUILDING_TITLE)).toBeVisible();
  await toasts(page).getByRole('button', { name: 'ปิดการแจ้งเตือน' }).click();
  await expect(toasts(page).getByText(BUILDING_TITLE)).toHaveCount(0);
});

test('the project page builds the report in the button, with no toast', async ({ page }) => {
  const path = `/projects/${PROJECT}`;
  await page.goto(path);
  const button = page.getByRole('button', { name: REPORT, exact: true });
  await expect(button).toBeEnabled();

  const download = page.waitForEvent('download', BUILD);
  await button.click();
  const busy = page.getByRole('button', { name: 'กำลังสร้าง…' });
  await expect(busy).toHaveAttribute('aria-busy', 'true');
  // A second click while building starts nothing new.
  await busy.click();

  expect((await download).suggestedFilename()).toBe(FILE_V3);
  await expect(page.getByRole('button', { name: 'ดาวน์โหลดอีกครั้ง' })).toBeVisible();
  // The change is spoken through a hidden live region, not a toast.
  await expect(page.getByRole('status').filter({ hasText: READY_TITLE })).toBeAttached();
  await expect(toasts(page).locator('li')).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(path);
});

test('a version in the list can build its own report, a draft cannot', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}`);
  await page.getByRole('tab', { name: /เวอร์ชัน/ }).click();

  const v2 = page.getByRole('button', { name: 'รายงาน PDF เวอร์ชัน 2' });
  const download = page.waitForEvent('download', BUILD);
  await v2.click();
  // Version 2 fails its first report in the mock: the button offers a retry.
  const retry = page.getByRole('button', { name: 'ลองอีกครั้ง เวอร์ชัน 2' });
  await expect(retry).toBeVisible(BUILD);
  await retry.click();
  expect((await download).suggestedFilename()).toBe(FILE_V2);
  await expect(page.getByRole('button', { name: 'ดาวน์โหลดอีกครั้ง เวอร์ชัน 2' })).toBeVisible();

  const draft = page.getByRole('button', { name: 'รายงาน PDF เวอร์ชัน 1' });
  await expect(draft).toHaveAttribute('aria-disabled', 'true');
  await draft.hover();
  // The reason shows on hover (and focus), and a disabled click starts nothing.
  await expect(
    page.locator('[data-radix-popper-content-wrapper]').getByText(DRAFT_REASON),
  ).toBeVisible();
  await draft.click({ force: true });
  await expect(page.getByRole('button', { name: 'กำลังสร้าง… เวอร์ชัน 1' })).toHaveCount(0);
});

test('the old report url redirects to the results', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V3}/report`);
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT}/versions/${V3}/results$`));
  await expect(page.getByText('ผลการประเมินความเสี่ยง – v3')).toBeVisible();
});
