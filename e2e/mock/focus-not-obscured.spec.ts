import { expect, test, type Page } from '../helpers/test';

// WCAG 2.4.11 Focus Not Obscured: tabbing never leaves the centre of the focused control under a
// sticky or fixed bar (the app header, the table header, the submit footer).
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V1 = '0193a5c2-0000-7000-8000-000000000101';

/** Describes the sticky or fixed element drawn over the centre of the focused control, if any. */
function coveredBy(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    for (let n = hit; n && n !== document.body; n = n.parentElement) {
      const position = getComputedStyle(n).position;
      // A hint or picker popover (Radix wrapper) is a transient layer for the field, not a bar.
      if (n.hasAttribute('data-radix-popper-content-wrapper')) return null;
      if ((position === 'sticky' || position === 'fixed') && !n.contains(el)) {
        const name = (el.textContent ?? '').trim().slice(0, 30);
        return `${n.tagName.toLowerCase()}.${n.className} covers ${el.tagName.toLowerCase()} "${name}"`;
      }
    }
    return null;
  });
}

async function tabThrough(page: Page, steps: number, key = 'Tab') {
  const covered: string[] = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(key);
    // Let the scroll that follows the focus settle before measuring.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
    const hit = await coveredBy(page);
    if (hit) covered.push(`#${i}: ${hit}`);
  }
  return covered;
}

test('tabbing through the assessment never lands under a sticky bar', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/projects/${PROJECT}/versions/${V1}/assess`);
  await expect(page.locator('[data-answer], tbody tr[data-state]').first()).toBeVisible({
    timeout: 30_000,
  });
  expect(await tabThrough(page, 220)).toEqual([]);
});

test('tabbing backwards from the end of the assessment never lands under a bar', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto(`/projects/${PROJECT}/versions/${V1}/assess`);
  await expect(page.locator('[data-answer], tbody tr[data-state]').first()).toBeVisible({
    timeout: 30_000,
  });
  expect(await tabThrough(page, 150, 'Shift+Tab')).toEqual([]);
});

test('tabbing through the versions tab never lands under the app header', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}?tab=versions`);
  await expect(page.getByRole('tab', { selected: true })).toBeVisible({ timeout: 30_000 });
  expect(await tabThrough(page, 60)).toEqual([]);
});
