import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { expect, test, type Page } from '@playwright/test';

// WCAG 2.5.3 Label in Name, on the mock api. A control's accessible name must contain
// its visible text, so a voice-control user who says what they see can activate it.
// Runs only axe's `label-content-name-mismatch` rule, which needs layout and so cannot
// run in jsdom. axe-core comes from web/node_modules (no extra dependency).

const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('../../web/node_modules/axe-core/axe.min.js'),
  'utf8',
);

const PAGES: { name: string; path: string; ready: string | RegExp; must: string[] }[] = [
  { name: 'dashboard', path: '/dashboard', ready: 'การกระจายระดับความเสี่ยง', must: ['actionText'] },
  { name: 'projects', path: '/projects', ready: 'ท่าเรือเกาะเต่า ระยะที่ 2', must: ['actionText'] },
  { name: 'project', path: `/projects/${PROJECT}`, ready: 'เวอร์ชันล่าสุด', must: ['levelLink'] },
  {
    name: 'project versions',
    path: `/projects/${PROJECT}?tab=versions`,
    ready: 'แนวโน้มข้ามเวอร์ชัน',
    must: [],
  },
  {
    name: 'results',
    path: `/projects/${PROJECT}/versions/${V3}/results`,
    ready: 'Heat Map',
    must: ['factorHit'],
  },
  { name: 'terms', path: '/legal/terms', ready: 'เงื่อนไขการใช้งาน', must: ['brand'] },
];

// The part of axe's API used below. axe-core is not a direct dependency of e2e/, so its types
// are not importable.
interface Axe {
  run(
    context: Document,
    options: {
      runOnly: { type: 'rule'; values: string[] };
      rules: Record<string, { enabled: boolean }>;
    },
  ): Promise<{ violations: { nodes: { html: string }[] }[] }>;
}

async function mismatches(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: Axe }).axe;
    const r = await axe.run(document, {
      runOnly: { type: 'rule', values: ['label-content-name-mismatch'] },
      rules: { 'label-content-name-mismatch': { enabled: true } },
    });
    return r.violations.flatMap((v) => v.nodes.map((n) => n.html.slice(0, 140)));
  });
}

for (const { name, path, ready, must } of PAGES) {
  test(`${name}: accessible names contain the visible text`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText(ready).and(page.locator(':visible')).first()).toBeVisible();
    // The controls the issue names are on the page, so an empty result means they pass.
    await page.waitForLoadState('networkidle');
    const html = await page.content();
    for (const cls of must) expect(html).toContain(cls);
    expect(await mismatches(page)).toEqual([]);
  });
}

// IO-231: the spoken names also read well, not only contain the visible text.
test('factor bars read their code once', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V3}/results`);
  const bars = page.locator('button[class*="factorHit"]');
  await expect(bars.first()).toBeVisible();
  for (const bar of await bars.all()) {
    const name = (await bar.getAttribute('aria-label')) ?? '';
    const code = (await bar.locator('[class*="factorCode"]').textContent()) ?? '';
    expect(code).not.toBe('');
    expect(name.split(code)).toHaveLength(2); // the code occurs exactly once
    expect(name).toMatch(new RegExp(`^\\d\\.\\d{2} ${code}`));
  }
});

test('level badges start with the printed code, and the advice hint is a description', async ({
  page,
}) => {
  await page.goto(`/projects/${PROJECT}`);
  const links = page.locator('a[class*="levelLink"]');
  await expect(links.first()).toBeVisible();
  for (const link of await links.all()) {
    const badge = link.locator('[aria-label]').first();
    const name = (await badge.getAttribute('aria-label')) ?? '';
    expect(name).toMatch(/^(H|VH) ความเสี่ยงสูง/);
    expect(await link.getAttribute('title')).toBeNull();
    const id = await link.getAttribute('aria-describedby');
    expect(await page.locator(`[id="${id}"]`).textContent()).toContain('ดูคำแนะนำของตัวชี้วัด');
  }
});
