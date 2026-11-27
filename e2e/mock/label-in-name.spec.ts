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

async function mismatches(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: typeof import('axe-core') }).axe;
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
