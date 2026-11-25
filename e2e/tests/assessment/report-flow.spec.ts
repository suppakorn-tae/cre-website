import { expect, test, type Page } from '@playwright/test';
import { loggedIn, type Api } from '../../helpers/api';
import { logInThroughUi, newUser } from '../auth/support';
import {
  answerBody,
  escapeRe,
  GOLDEN_M,
  GOLDEN_V2,
  GOLDEN_VH,
  GOLDEN_VL,
  msg,
  pdfText,
  send,
  type Golden,
} from './support';

type Item = { indicator_code: string; rl: number; ri_c: number; ri_t: number; ri_e: number; rm: number; level: string; strategy?: string };

const rm3 = (n: number) => n.toFixed(3);
const sc2 = (n: number) => n.toFixed(2);

async function json<T>(res: Awaited<ReturnType<Api['get']>>, status = 200): Promise<T> {
  expect(res.status(), await res.text()).toBe(status);
  return (await res.json()) as T;
}

/** The table row of one indicator on the results page. */
const row = (page: Page, code: string) =>
  page.getByRole('row').filter({ hasText: new RegExp(`\\b${escapeRe(code)}\\b`) });

test.describe.serial('project to report (UC-05 to UC-13)', () => {
  let api: Api;
  let projectId = '';
  let v1 = '';
  let v2 = '';
  let jobId = '';
  let page: Page;
  let nickname = '';

  test.beforeAll(async ({ browser }) => {
    const who = await newUser('assess');
    api = await loggedIn(who);
    page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
    await logInThroughUi(page, who.email, who.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    nickname = `E2E-${Date.now().toString(36)}`;
  });

  test.afterAll(async () => {
    await api.dispose();
    await page.context().close();
  });

  test('create a project and a first version', async () => {
    projectId = await api.createProject({ name: 'Assessment flow', nickname });
    await page.goto('/projects');
    await expect(page.getByText(nickname).first()).toBeVisible();

    await page.goto(`/projects/${projectId}`);
    await page.getByRole('button', { name: msg('versions', 'list.create') }).first().click();
    await page.getByRole('button', { name: msg('versions', 'create.confirm') }).click();
    await expect(page.getByRole('link', { name: msg('versions', 'list.actions.answer') })).toBeVisible();

    const versions = await json<{ items: { id: string; version_no: number; status: string }[] }>(
      await api.get(`/projects/${projectId}/versions`),
    );
    expect(versions.items).toHaveLength(1);
    expect(versions.items[0]).toMatchObject({ version_no: 1, status: 'draft' });
    v1 = versions.items[0]!.id;
  });

  test('answer three indicators, autosave keeps them, and submit scores them', async () => {
    await page.goto(`/projects/${projectId}/versions/${v1}/assess`);
    await expect(page.getByRole('heading', { name: msg('assessment', 'title') })).toBeVisible();

    const answers = [GOLDEN_VH, GOLDEN_M, GOLDEN_VL];
    const put = await send(api, 'patch', `/projects/${projectId}/versions/${v1}/answers`, {
      answers: answers.map(answerBody),
    });
    expect(put.status(), await put.text()).toBe(200);

    const list = await json<{ editable: boolean; items: { indicator_code: string; complete: boolean }[] }>(
      await api.get(`/projects/${projectId}/versions/${v1}/answers`),
    );
    expect(list.editable).toBe(true);
    expect(list.items.filter((i) => i.complete).map((i) => i.indicator_code).sort()).toEqual(
      answers.map((a) => a.code).sort(),
    );

    // Reload: the page shows the saved progress, not an empty form.
    await page.reload();
    await expect(
      page.getByText(msg('assessment', 'progress.overall', { complete: 3, total: 55 })),
    ).toBeVisible();

    const submit = await api.post(`/projects/${projectId}/versions/${v1}/submit`, {});
    const body = await json<{ status: string; summary: { scored_count: number; level_counts: Record<string, number>; average_rm: number } }>(submit);
    expect(body.status).toBe('submitted');
    expect(body.summary.scored_count).toBe(3);
    expect(body.summary.level_counts).toMatchObject({ VL: 1, L: 0, M: 1, H: 0, VH: 1 });
    expect(body.summary.average_rm).toBeCloseTo((GOLDEN_VH.rm + GOLDEN_M.rm + GOLDEN_VL.rm) / 3, 3);
  });

  test('results match the engine golden values in the API and in every tab', async () => {
    const res = await json<{ items: Item[] }>(
      await api.get(`/projects/${projectId}/versions/${v1}/results`),
    );
    for (const g of [GOLDEN_VH, GOLDEN_M, GOLDEN_VL] as Golden[]) {
      const item = res.items.find((i) => i.indicator_code === g.code)!;
      expect(item, g.code).toMatchObject({ rl: g.rl, ri_c: g.ri_c, ri_t: g.ri_t, ri_e: g.ri_e, rm: g.rm, level: g.level });
    }

    await page.goto(`/projects/${projectId}/versions/${v1}/results`);
    await expect(page.getByRole('heading', { name: msg('results', 'page.title', { no: 1 }) })).toBeVisible();

    await page.getByRole('tab', { name: msg('results', 'tabs.overview') }).click();
    await expect(page.getByRole('tabpanel')).toContainText(rm3(GOLDEN_VH.rm));

    await page.getByRole('tab', { name: msg('results', 'tabs.table') }).click();
    for (const g of [GOLDEN_VH, GOLDEN_M, GOLDEN_VL]) {
      const r = row(page, g.code);
      await expect(r).toContainText(rm3(g.rm));
      await expect(r).toContainText(sc2(g.rl));
      await expect(r).toContainText(sc2(g.ri_c));
      await expect(r).toContainText(sc2(g.ri_t));
    }

    await page.getByRole('tab', { name: msg('results', 'tabs.heatmap') }).click();
    await expect(page.getByRole('tabpanel')).toContainText(GOLDEN_VH.code);
  });

  test('choose a strategy for the VH indicator on the H / VH tab', async () => {
    await page.goto(`/projects/${projectId}/versions/${v1}/results`);
    await page.getByRole('tab', { name: new RegExp(escapeRe(msg('results', 'tabs.hvh'))) }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel).toContainText(GOLDEN_VH.code);
    await expect(panel).not.toContainText(GOLDEN_M.code);

    await panel.getByRole('radio', { name: msg('advice', 'strategy.options.REDUCE') }).check();
    await expect(panel.getByText(new RegExp(escapeRe(msg('advice', 'strategy.savedAt', { at: '' }))))).toBeVisible();

    const res = await json<{ items: Item[] }>(await api.get(`/projects/${projectId}/versions/${v1}/results`));
    expect(res.items.find((i) => i.indicator_code === GOLDEN_VH.code)?.strategy).toBe('REDUCE');
    // A strategy is only for H / VH indicators.
    const bad = await send(api, 'put', `/projects/${projectId}/versions/${v1}/results/${GOLDEN_M.code}/strategy`, { strategy: 'ACCEPT' });
    expect(bad.status()).toBe(422);
  });

  test('request the report, download the PDF and find the indicator and strategy', async () => {
    await page.goto(`/projects/${projectId}/versions/${v1}/report`);
    await page.getByRole('button', { name: msg('reports', 'request') }).click();
    await expect(page.getByText(msg('reports', 'status.done'))).toBeVisible({ timeout: 120_000 });

    const download = page.getByRole('link', { name: msg('reports', 'download') }).or(
      page.getByRole('button', { name: msg('reports', 'download') }),
    );
    const [dl] = await Promise.all([page.waitForEvent('download'), download.click()]);
    const path = await dl.path();
    const { readFileSync } = await import('node:fs');
    const pdf = readFileSync(path);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

    const text = pdfText(pdf);
    expect(text).toContain(GOLDEN_VH.code);
    expect(text).toContain(rm3(GOLDEN_VH.rm));
    expect(text).toContain(msg('advice', 'strategy.options.REDUCE'));

    // Remember the job for the delete step.
    const again = await api.post(`/projects/${projectId}/versions/${v1}/reports`, {});
    expect(again.status()).toBe(202);
    jobId = ((await again.json()) as { job_id: string }).job_id;
    const direct = await api.get(`/reports/${jobId}/download`);
    expect(direct.status()).toBe(200);
    expect(direct.headers()['content-type']).toContain('application/pdf');
  });

  test('create v2: v1 becomes read-only and the two versions compare', async () => {
    const created = await api.post(`/projects/${projectId}/versions`, {});
    const v = await json<{ id: string; version_no: number }>(created, 201);
    expect(v.version_no).toBe(2);
    v2 = v.id;

    // v1 rejects writes and says it is not editable.
    const list = await json<{ editable: boolean }>(await api.get(`/projects/${projectId}/versions/${v1}/answers`));
    expect(list.editable).toBe(false);
    const write = await send(api, 'put', `/projects/${projectId}/versions/${v1}/answers/${GOLDEN_VH.code}`, answerBody(GOLDEN_VH));
    expect(write.status()).toBe(409);
    const strat = await send(api, 'put', `/projects/${projectId}/versions/${v1}/results/${GOLDEN_VH.code}/strategy`, { strategy: 'AVOID' });
    expect(strat.status()).toBe(409);

    await page.goto(`/projects/${projectId}/versions/${v1}/assess`);
    await expect(page.getByText(msg('assessment', 'readOnly'))).toBeVisible();
    await page.goto(`/projects/${projectId}/versions/${v1}/results`);
    await page.getByRole('tab', { name: new RegExp(escapeRe(msg('results', 'tabs.hvh'))) }).click();
    await expect(page.getByText(msg('advice', 'strategy.readOnly'))).toBeVisible();

    // v2: answer EC-MG-1 low and EC-MG-3, submit.
    const put = await send(api, 'put', `/projects/${projectId}/versions/${v2}/answers/${GOLDEN_V2.code}`, answerBody(GOLDEN_V2));
    expect(put.status(), await put.text()).toBe(200);
    expect((await send(api, 'put', `/projects/${projectId}/versions/${v2}/answers/${GOLDEN_VL.code}`, answerBody(GOLDEN_VL))).status()).toBe(200);
    await json(await api.post(`/projects/${projectId}/versions/${v2}/submit`, {}));

    const res = await json<{ items: Item[] }>(await api.get(`/projects/${projectId}/versions/${v2}/results`));
    expect(res.items.find((i) => i.indicator_code === GOLDEN_V2.code)).toMatchObject({ rl: GOLDEN_V2.rl, ri_c: GOLDEN_V2.ri_c, ri_t: GOLDEN_V2.ri_t, rm: GOLDEN_V2.rm, level: GOLDEN_V2.level });

    const cmp = await json<{ level_changes?: { indicator_code: string; direction?: string }[] }>(
      await api.get(`/projects/${projectId}/compare?target_version_id=${v2}&base_version_id=${v1}`),
    );
    expect(JSON.stringify(cmp)).toContain(GOLDEN_V2.code);

    await page.goto(`/projects/${projectId}/compare`);
    await expect(page.getByRole('heading', { name: msg('compare', 'title') })).toBeVisible();
    await expect(page.getByRole('table', { name: msg('compare', 'changes.caption') })).toContainText(GOLDEN_V2.code);
  });

  test('delete the project: it disappears everywhere and the report is gone', async () => {
    await page.goto('/projects');
    const r = page.getByRole('row').filter({ hasText: nickname });
    await r.getByRole('button', { name: msg('projects', 'list.delete') }).click();
    await page.getByRole('button', { name: msg('projects', 'list.deleteDialog.confirm'), exact: true }).click();
    await expect(page.getByText(msg('projects', 'list.deleted'))).toBeVisible();
    await expect(page.getByText(nickname)).toHaveCount(0);

    expect((await api.get(`/projects/${projectId}`)).status()).toBe(404);
    expect((await api.get(`/projects/${projectId}/versions`)).status()).toBe(404);
    expect((await api.get(`/projects/${projectId}/versions/${v1}/results`)).status()).toBe(404);
    expect((await api.get(`/reports/${jobId}/download`)).status()).toBe(404);
    const listed = await json<{ items: { id: string }[] }>(await api.get('/projects'));
    expect(listed.items.map((p) => p.id)).not.toContain(projectId);
    await page.goto('/dashboard');
    await expect(page.getByText(nickname)).toHaveCount(0);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText(msg('versions', 'detail.notFound'))).toBeVisible();
  });
});
