import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { expect, test, type Page } from '../helpers/test';

// IO-259: the four results tabs and the compare page in dark mode pass axe's colour
// contrast rule, and really paint with the dark tokens. axe-core comes from web/node_modules.

const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const SHOTS = process.env.E2E_SHOTS_DIR;

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('../../web/node_modules/axe-core/axe.min.js'),
  'utf8',
);

interface Axe {
  run(
    context: Document,
    options: { runOnly: { type: 'rule'; values: string[] } },
  ): Promise<{ violations: { nodes: { html: string; any: { message: string }[] }[] }[] }>;
}

async function colourProblems(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: Axe }).axe;
    const r = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    return r.violations.flatMap((v) =>
      v.nodes.map((n) => `${n.html.slice(0, 100)} ${n.any[0]?.message ?? ''}`),
    );
  });
}

// Bars and values animate in; axe must read the settled chart, not the first frame.
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cre-theme', 'dark'));
});

const RESULTS = `/projects/${PROJECT}/versions/${V3}/results`;
const TABS = ['ภาพรวม', 'ตารางรายละเอียด', 'Heat Map', 'H / VH เท่านั้น'];

for (const [i, tab] of TABS.entries()) {
  test(`results tab "${tab}" in dark mode passes colour contrast`, async ({ page }, info) => {
    await page.goto(RESULTS);
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(canvas).not.toBe('rgb(255, 255, 255)');
    expect(await colourProblems(page)).toEqual([]);
    if (SHOTS) {
      const name = `tab${i + 1}`;
      await page.screenshot({
        path: `${SHOTS}/results-${name}-${info.project.name}.png`,
        fullPage: true,
      });
    }
  });
}

test('compare (RM view of the versions tab) in dark mode passes colour contrast', async ({
  page,
}, info) => {
  await page.goto(`/projects/${PROJECT}?tab=versions&view=rm`);
  await expect(page.getByText('RM รายตัวชี้วัด').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await colourProblems(page)).toEqual([]);
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/compare-${info.project.name}.png`, fullPage: true });
  }
});

test('the factor bars and heat map take their dark token values', async ({ page }) => {
  await page.goto(RESULTS);
  await page.getByRole('tab', { name: 'Heat Map' }).click();
  const vals = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return ['--factor-rl', '--factor-ri', '--heat-vh', '--heat-vl'].map((n) =>
      s.getPropertyValue(n).trim(),
    );
  });
  expect(vals).toEqual(['#6f7f96', '#a9b6c8', '#fdba74', '#2a2222']);
});
