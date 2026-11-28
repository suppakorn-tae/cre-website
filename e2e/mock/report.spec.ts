import { expect, test } from '../helpers/test';

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
  const busy = page.locator('button[data-report="building"]');
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

test('a submitted version builds its own report from its menu, a draft has no item', async ({
  page,
}) => {
  await page.goto(`/projects/${PROJECT}?tab=versions`);
  await page.getByRole('button', { name: 'การดำเนินการของ v2' }).click();

  const download = page.waitForEvent('download', BUILD);
  await page.getByRole('menuitem', { name: REPORT, exact: true }).click();
  // The menu stays open and the item says it is building; a second click starts nothing new.
  const busy = page.getByRole('menuitem', { name: 'กำลังสร้าง…' });
  await expect(busy).toHaveAttribute('aria-busy', 'true');
  await busy.click();
  // Version 2 fails its first report in the mock: the item offers a retry.
  const retry = page.getByRole('menuitem', { name: 'ลองอีกครั้ง' });
  await expect(retry).toBeVisible(BUILD);
  await expect(toasts(page).locator('li')).toHaveCount(0);
  await retry.click();
  expect((await download).suggestedFilename()).toBe(FILE_V2);
  await expect(page.getByRole('menuitem', { name: 'ดาวน์โหลดอีกครั้ง' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/projects/${PROJECT}`);

  // A draft has no report item at all; its menu keeps the answers and the delete.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'การดำเนินการของ v1' }).click();
  await expect(page.getByRole('menuitem', { name: 'ดูคำตอบ' })).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: /รายงาน PDF|กำลังสร้าง|ดาวน์โหลดอีกครั้ง|ลองอีกครั้ง/ }),
  ).toHaveCount(0);
});

test('the old report url redirects to the results', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V3}/report`);
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT}/versions/${V3}/results$`));
  await expect(page.getByText('ผลการประเมินความเสี่ยง – v3')).toBeVisible();
});

test('a report job stuck in the queue stops polling and offers to check again', async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('cre-mock-stuck-jobs', '1'));
  const polls: string[] = [];
  let inFlight = 0;
  const isPoll = (url: string) => /\/api\/v1\/jobs\//.test(url);
  page.on('request', (request) => {
    if (!isPoll(request.url())) return;
    polls.push(request.url());
    inFlight += 1;
  });
  const settled = (request: import('@playwright/test').Request) => {
    if (isPoll(request.url())) inFlight -= 1;
  };
  page.on('requestfinished', settled);
  page.on('requestfailed', settled);
  await page.goto(`/projects/${PROJECT}/versions/${V3}/results`);
  await page.getByRole('button', { name: REPORT, exact: true }).click();

  // The app waits 2 minutes for a queued job to start, counted from its first answer for the
  // job. That answer can land before or after a jump of the page's clock, so run the clock on
  // in steps until the app gives up, rather than guess how far one jump must go.
  await expect(toasts(page).getByText(BUILDING_TITLE)).toBeVisible(BUILD);
  const stalled = toasts(page).getByText('ระบบยังไม่เริ่มงานนี้');
  await expect(async () => {
    await page.clock.fastForward('00:30');
    await expect(stalled).toBeVisible({ timeout: 1_000 });
  }).toPass(BUILD);
  const checkAgain = toasts(page).getByRole('button', { name: 'ตรวจสอบอีกครั้ง' }).first();
  await expect(checkAgain).toBeVisible();

  // Polling has stopped: no request after the toast, however long the page's clock runs.
  await expect.poll(() => inFlight).toBe(0);
  const before = polls.length;
  await page.clock.fastForward('01:00');
  await page.clock.fastForward('01:00');
  await expect.poll(() => inFlight).toBe(0);
  expect(polls.length).toBe(before);

  // Pressed with the keyboard: on a phone the dev-only Next badge sits over the toast.
  await checkAgain.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => polls.length).toBeGreaterThan(before);
});
