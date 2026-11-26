import { expect, test, type Page } from '@playwright/test';

// The sample project and its submitted version (answers included) from the web mocks.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const PATH = `/projects/${PROJECT}/versions/${V3}/assess`;

// The table is a card list on a phone; this file checks the desktop and tablet table.
test.skip(({ isMobile }) => isMobile, 'table layout only');

const bubble = (page: Page) => page.locator('[data-radix-popper-content-wrapper]');

async function open(page: Page) {
  await page.goto(PATH);
  await expect(page.getByRole('textbox', { name: 'X ความถี่ของเหตุการณ์ EC-MG-1' })).toBeVisible();
}

test('the question shows on focus, never on hover, and goes on Esc or blur', async ({ page }) => {
  await open(page);
  const x = page.getByRole('textbox', { name: 'X ความถี่ของเหตุการณ์ EC-MG-1' });

  await x.hover();
  await page.waitForTimeout(400);
  await expect(bubble(page)).toHaveCount(0);

  await x.focus();
  await expect(bubble(page)).toContainText('X ความถี่ของเหตุการณ์');
  // The unit shows under the input, not in the question bubble.
  await expect(bubble(page)).not.toContainText('หน่วย:');

  // The bubble sits above the field and does not cover it.
  const box = await bubble(page).boundingBox();
  const field = await x.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(field!.y);

  // The same text is what a screen reader reads.
  const id = await x.getAttribute('aria-describedby');
  expect(id).toBeTruthy();
  await expect(page.locator(`[id="${id!.split(' ')[0]}"]`)).toContainText('X ความถี่ของเหตุการณ์');

  await page.keyboard.press('Escape');
  await expect(bubble(page)).toHaveCount(0);

  await x.blur();
  await x.focus();
  await expect(bubble(page)).toHaveCount(1);
  await page.getByRole('textbox', { name: 'y1 ผลกระทบด้านต้นทุน EC-MG-1' }).focus();
  // The bubble of X is still fading out for 150 ms: the new one is the last.
  await expect(bubble(page).last()).toContainText('y1 ผลกระทบด้านต้นทุน');
  await page.locator('h1').click();
  await expect(bubble(page)).toHaveCount(0);
});

for (const width of [768, 1280]) {
  test(`the header row is sticky and lines up with the inputs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));

    const heads = page.locator('thead th');
    await expect(heads).toHaveCount(7);
    const top = await heads.first().evaluate((el) => el.getBoundingClientRect().top);
    const height = await heads.first().evaluate((el) => el.getBoundingClientRect().height);
    expect(top).toBe(64); // under the 64px app header
    expect(height).toBe(44);

    // Left edge of the header text against the left edge of the input (or code text) of a row.
    const lefts = await page.evaluate(() => {
      const textLeft = (el: Element) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().left;
      };
      const row = [...document.querySelectorAll('tbody tr[data-state]')].find(
        (r) => r.getBoundingClientRect().top > 150,
      )!;
      const heads = [...document.querySelectorAll('thead th')];
      return [...row.children].map((cell, i) => {
        const control = cell.querySelector('input, button');
        return {
          head: textLeft(heads[i]!),
          cell: control ? control.getBoundingClientRect().left : textLeft(cell),
        };
      });
    });
    // Code, indicator, X, y1, y2 and y3 columns (the status badge is a pill with padding).
    for (const { head, cell } of lefts.slice(0, 6))
      expect(Math.abs(head - cell)).toBeLessThanOrEqual(2);

    // The unit of X is written out, not cut off, and the page does not scroll sideways.
    await expect(page.locator('thead th').nth(2)).toContainText('หน่วยตามตัวชี้วัด');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
}

test('the y3 panel asks the question first, one lettered checkbox per line, and flags A with others', async ({
  page,
}) => {
  await open(page);
  const trigger = page.getByRole('button', { name: /y3 ผลกระทบด้านสิ่งแวดล้อม EC-MG-1/ });
  await trigger.focus();
  // The y3 cell has no question bubble; the panel asks the question itself.
  await expect(bubble(page)).toHaveCount(0);
  await trigger.press('Enter');

  const panel = page.getByRole('dialog');
  await expect(panel).toBeVisible();
  // Focus moved inside; the only popper left is the panel.
  await expect(panel.getByRole('checkbox').first()).toBeFocused();
  await expect(bubble(page)).toHaveCount(1);

  const boxes = panel.getByRole('checkbox');
  await expect(boxes).toHaveCount(9);
  const question = await panel.locator('p').first().boundingBox();
  const firstLine = await boxes.first().locator('xpath=..').boundingBox();
  expect(question!.y).toBeLessThan(firstLine!.y);
  for (let i = 0; i < 9; i++) {
    const line = await boxes.nth(i).locator('xpath=..').boundingBox();
    expect(line!.height).toBeGreaterThanOrEqual(44);
  }

  // EC-MG-1 starts as A only: no error. Add B with the keyboard: error at once, choices kept.
  const error = panel.getByText('A เลือกคู่กับข้ออื่นไม่ได้');
  await expect(error).toHaveCount(0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(error).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: /^A / })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: /^B / })).toBeChecked();
  await expect(panel.locator('fieldset')).toHaveAttribute('aria-invalid', 'true');
  await expect(panel.locator('[aria-live="polite"]')).toContainText('A เลือกคู่กับ');

  // "เสร็จ" is off while A is chosen with another letter; clearing A fixes it.
  await expect(panel.getByRole('button', { name: 'เสร็จ' })).toBeDisabled();
  await panel.getByRole('checkbox', { name: /^A / }).uncheck();
  await expect(error).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'เสร็จ' })).toBeEnabled();

  // Esc saves nothing: the cell keeps the saved choice (A only) and focus returns to the button.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toContainText('A');
  await expect(trigger).not.toContainText('B');

  // "เสร็จ" saves the edited choice (B only) and closes.
  await trigger.press('Enter');
  await page.getByRole('checkbox', { name: /^B / }).check();
  await page.getByRole('checkbox', { name: /^A / }).uncheck();
  await page.getByRole('button', { name: 'เสร็จ' }).click();
  await expect(panel).toHaveCount(0);
  await expect(trigger).toContainText('B');
  await expect(trigger).not.toContainText('A');

  // "ล้าง" empties the choice and "เสร็จ" closes.
  await trigger.press('Enter');
  await page.getByRole('button', { name: 'ล้าง' }).click();
  await expect(page.getByRole('checkbox', { name: /^B / })).not.toBeChecked();
  await page.getByRole('button', { name: 'เสร็จ' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // Focus came back by itself, so the hint stays closed until the field is entered again.
  await expect(bubble(page)).toHaveCount(0);
});

test('a dimension folds its factors, each factor keeps its own state, and a reload keeps both', async ({
  page,
}) => {
  await open(page);
  const rows = page.locator('tbody tr[data-state]');
  const total = await rows.count();
  const factor = page.getByRole('button', { name: /^EC-MG / });
  const dimension = page.getByRole('button', { name: 'ด้านเศรษฐกิจ', exact: true });

  await factor.click();
  await expect(factor).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('textbox', { name: 'X ความถี่ของเหตุการณ์ EC-MG-1' })).toHaveCount(0);

  await dimension.click();
  await expect(dimension).toHaveAttribute('aria-expanded', 'false');
  await expect(factor).toHaveCount(0);

  // Folded state is remembered for this version.
  await page.reload();
  await expect(dimension).toHaveAttribute('aria-expanded', 'false');

  // Opening the dimension brings the factor back as it was left: still folded.
  await dimension.click();
  await expect(factor).toHaveAttribute('aria-expanded', 'false');
  await factor.click();
  await expect(rows).toHaveCount(total);
});
