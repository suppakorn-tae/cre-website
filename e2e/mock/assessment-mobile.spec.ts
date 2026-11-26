import { expect, test, type Page } from '@playwright/test';

// The sample project; v3 is submitted (all 55 answered), v1 is a draft with no answers.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const V1 = '0193a5c2-0000-7000-8000-000000000101';
const path = (version: string) => `/projects/${PROJECT}/versions/${version}/assess`;

// The layout is chosen by screen width, so one browser project is enough; each test sets its own.
test.skip(({ isMobile }) => isMobile, 'sets its own viewport');

const cards = (page: Page) => page.locator('[data-answer]');
const bar = (page: Page) => page.locator('footer');

async function open(page: Page, width: number, version = V3, height = 800) {
  await page.setViewportSize({ width, height });
  await page.goto(path(version));
  // The first visit compiles the page in the dev server, which can be slow.
  await expect(page.locator('[data-answer], tbody tr[data-state]').first()).toBeVisible({
    timeout: 30_000,
  });
}

const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('55 collapsed cards make a page of at most 6000px at 375px', async ({ page }) => {
  await open(page, 375);
  await expect(cards(page)).toHaveCount(55);
  for (const toggle of await page.locator('[data-answer] > h4 > button').all())
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThanOrEqual(6000);

  // No input is on the page, and so no question text either.
  await expect(page.getByRole('textbox')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('คำถาม ·');
});

test('a card header shows the code, name, status and how many fields are answered', async ({
  page,
}) => {
  await open(page, 375);
  const header = cards(page).first().locator(':scope > h4 > button');
  await expect(header).toContainText('EC-MG-1');
  await expect(header).toContainText('ตอบครบ');
  await expect(header).toContainText('ตอบแล้ว 4/4');
  // Tall enough to tap.
  expect((await header.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await open(page, 375, V1);
  await expect(cards(page).first().locator(':scope > h4 > button')).toContainText('ตอบแล้ว 0/4');
});

test('a card opens to X, y1, y2 and y3, each with a label, and the question shows only on focus', async ({
  page,
}) => {
  await open(page, 375);
  const card = cards(page).nth(1);
  await card.locator(':scope > h4 > button').click();
  await expect(card.locator(':scope > h4 > button')).toHaveAttribute('aria-expanded', 'true');

  const labels = card.locator('label, span[aria-hidden="true"]').filter({ hasText: /^(X|y\d)/ });
  await expect(labels).toHaveText([
    'X ความถี่ของเหตุการณ์',
    'y1 ผลกระทบด้านต้นทุน',
    'y2 ผลกระทบด้านเวลา',
    'y3 ผลกระทบด้านสิ่งแวดล้อม',
  ]);
  // Fields are stacked: each starts below the one before it.
  const tops: number[] = [];
  for (const name of ['X ความถี่', 'y1 ผลกระทบ', 'y2 ผลกระทบ']) {
    tops.push((await card.getByRole('textbox', { name: new RegExp(`^${name}`) }).boundingBox())!.y);
  }
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  expect(new Set(tops).size).toBe(3);
  // Each input is at least 44px tall.
  const y1 = card.getByRole('textbox', { name: /^y1 / });
  expect((await y1.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // The question is in the page for screen readers, but not seen until the field has focus.
  const hintId = (await y1.getAttribute('aria-describedby'))!.split(' ')[0];
  const hint = page.locator(`[id="${hintId}"]`);
  await expect(hint).toContainText('คำถาม · EC-MG-2 · y1');
  expect((await hint.boundingBox())!.width).toBeLessThanOrEqual(1);

  await y1.focus();
  const shown = await hint.boundingBox();
  expect(shown!.width).toBeGreaterThan(200);
  // In the page above the field, not a floating bubble.
  expect(shown!.y + shown!.height).toBeLessThanOrEqual((await y1.boundingBox())!.y);
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0);

  // It leaves a moment after the field loses focus (so a tap on the next button still lands).
  await page.locator('h1').click();
  await expect.poll(async () => (await hint.boundingBox())!.width).toBeLessThanOrEqual(1);
});

test('the y3 panel is a bottom sheet of at most 80% of the screen with the same content', async ({
  page,
}) => {
  await open(page, 375, V3, 700);
  await cards(page).first().locator(':scope > h4 > button').click();
  const trigger = page.getByRole('button', { name: /y3 ผลกระทบด้านสิ่งแวดล้อม EC-MG-1/ });
  await trigger.click();

  const sheet = page.getByRole('dialog', { name: /y3 ผลกระทบด้านสิ่งแวดล้อม EC-MG-1/ });
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(375);
  expect(box.height).toBeLessThanOrEqual(700 * 0.8 + 1);
  expect(Math.round(box.y + box.height)).toBe(700); // sits on the bottom edge

  // Same content as the desktop panel: the question first, nine lettered checkboxes, clear, done.
  await expect(sheet.getByRole('checkbox')).toHaveCount(9);
  await expect(sheet.getByRole('button', { name: 'ล้าง' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'เสร็จ' })).toBeVisible();
  expect(await sideways(page)).toBe(0);

  // Choosing A with another option is flagged at once, as in the popover.
  await sheet.getByRole('checkbox', { name: /^B / }).check();
  await expect(sheet.getByText('เลือก A ร่วมกับตัวเลือกอื่นไม่ได้')).toBeVisible();

  // Esc closes it, focus goes back to the button and the hint stays closed.
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const hintId = (await trigger.getAttribute('aria-describedby'))!.split(' ')[0];
  expect((await page.locator(`[id="${hintId}"]`).boundingBox())!.width).toBeLessThanOrEqual(1);

  await trigger.click();
  await page.getByRole('button', { name: 'เสร็จ' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('the field legend is one closed row, and the unit switches are two big segments each', async ({
  page,
}) => {
  await open(page, 375);
  const legend = page.getByRole('button', { name: 'คำอธิบายช่องกรอก' });
  await expect(legend).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('ความถี่ของเหตุการณ์', { exact: true })).toHaveCount(0);
  await legend.click();
  await expect(page.getByText('ความถี่ของเหตุการณ์', { exact: true })).toBeVisible();
  await legend.click();

  const segments = page.getByRole('radio');
  await expect(segments).toHaveCount(4);
  for (const segment of await segments.all())
    expect((await segment.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // One row: both switches start at the same height.
  const groups = page.getByRole('radiogroup');
  expect((await groups.nth(0).boundingBox())!.y).toBe((await groups.nth(1).boundingBox())!.y);
});

test('the bottom bar holds both buttons and never covers the notes or the last card', async ({
  page,
}) => {
  await open(page, 375, V1);
  const save = bar(page).getByRole('button', { name: 'บันทึกคำตอบ' });
  const submit = bar(page).getByRole('button', { name: 'ส่งผลการประเมิน' });
  await expect(save).toBeVisible();
  await expect(submit).toBeVisible();
  // Side by side, both tall enough to tap, fixed to the bottom edge.
  const a = (await save.boundingBox())!;
  const b = (await submit.boundingBox())!;
  expect(a.y).toBe(b.y);
  expect(a.x).toBeLessThan(b.x);
  expect(a.height).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(await bar(page).evaluate((el) => getComputedStyle(el).position)).toBe('fixed');

  // Nothing is answered yet: the reason is on the page above the bar, not inside it.
  const note = page.getByRole('note').filter({ hasText: 'ส่งผลการประเมินไม่ได้' });
  await expect(note).toBeVisible();
  await expect(bar(page).getByRole('note')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const noteBox = (await note.boundingBox())!;
  const barBox = (await bar(page).boundingBox())!;
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(barBox.y);

  // The last card is fully above the bar when the page is scrolled to its end.
  const last = (await cards(page).last().boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(noteBox.y);
});

test('the last card can be opened and filled while the bar is in view', async ({ page }) => {
  await open(page, 375, V1, 667);
  const last = cards(page).last();
  await last.scrollIntoViewIfNeeded();
  await last.locator(':scope > h4 > button').click();
  const x = last.getByRole('textbox', { name: /^X / });
  await x.fill('3');
  await x.focus();
  await expect(x).toHaveValue('3');

  // Scroll the page to its end: the whole card, with its y3 button, is above the bar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const barTop = (await bar(page).boundingBox())!.y;
  const card = (await last.boundingBox())!;
  expect(card.y + card.height).toBeLessThanOrEqual(barTop);

  // Fill the rest; the header counts it.
  await last.getByRole('textbox', { name: /^y1 / }).fill('10');
  await last.getByRole('textbox', { name: /^y2 / }).fill('5');
  await last.getByRole('button', { name: /^y3 / }).click();
  await page.getByRole('checkbox', { name: /^B / }).check();
  await page.getByRole('button', { name: 'เสร็จ' }).click();
  await expect(last.locator(':scope > h4 > button')).toContainText('ตอบแล้ว 4/4');
  await expect(last.locator(':scope > h4 > button')).toContainText('ตอบครบ');
});

test('the group headers stay in view under the app header while their cards scroll', async ({
  page,
}) => {
  await open(page, 375);
  await page.evaluate(() => window.scrollTo(0, 1500));
  const dim = (await page.locator('h2').filter({ hasText: /ด้าน/ }).first().boundingBox())!;
  expect(dim.y).toBe(64);
  const factor = page.locator('h3').filter({ hasText: /^EC-/ });
  const tops = await factor.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(tops.some((top) => top === 64 + 40)).toBe(true);
});

for (const width of [320, 375, 768]) {
  test(`the page does not scroll sideways at ${width}px`, async ({ page }) => {
    await open(page, width);
    expect(await sideways(page)).toBe(0);

    if (width < 768) {
      await cards(page).first().locator(':scope > h4 > button').click();
      await cards(page).nth(1).locator(':scope > h4 > button').click();
      await cards(page).first().getByRole('textbox', { name: /^y1 / }).focus();
      expect(await sideways(page)).toBe(0);
      await cards(page).first().getByRole('button', { name: /^y3 / }).click();
      expect(await sideways(page)).toBe(0);
    } else {
      // The table is kept from 768px, with its header row.
      await expect(page.locator('table')).toHaveCount(1);
      await expect(cards(page)).toHaveCount(0);
      await page.getByRole('textbox', { name: /^y1 .* EC-MG-1$/ }).focus();
      expect(await sideways(page)).toBe(0);
    }
  });
}
