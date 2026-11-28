import { readFileSync } from 'node:fs';
import { expect, guardedContext, test, type Download, type Page } from '../../helpers/test';
import { loggedIn, type Api } from '../../helpers/api';
import { newUser } from '../auth/support';
import { pdfText } from './pdf-text';
import {
  answerBody,
  escapeRe,
  GOLDEN_M,
  GOLDEN_VH,
  GOLDEN_VL,
  msg,
  reportMsg,
  send,
  thaiBase,
} from './support';

/**
 * IO-248: one current PDF per version (architecture decisions v2.14). Every click asks the
 * server; the same inputs give the same job, a new submission or a chosen strategy gives a new
 * one. The pages move on the client side (step bar links), so the report job stays cached in
 * the tab, as in the review flows.
 */

const rm3 = (n: number) => n.toFixed(3);

/** Navigate without waiting for the load event: slow third-party assets must not fail a test. */
async function go(p: Page, url: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      if (attempt === 5) throw err;
    }
  }
}

test.describe.serial('a new PDF after a resubmit or a strategy change (IO-248)', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

  let api: Api;
  let page: Page;
  let projectId = '';
  let v1 = '';
  /** Every job id the report button got, in order. */
  const jobs: string[] = [];

  const resultsPath = () => `/projects/${projectId}/versions/${v1}/results`;
  const steps = () => page.getByRole('navigation', { name: msg('shell', 'steps.label') });
  const reportButton = () =>
    page.getByRole('button', { name: msg('reports', 'action.label'), exact: true });
  /** A visible link to a path of v1 (the step bar has one per step). */
  const linkTo = (suffix: string) =>
    page.locator(`a[href$="/versions/${v1}/${suffix}"]`).and(page.locator(':visible')).first();

  /** Clicks the report button and returns the job the server answered with and the file. */
  async function clickReport(): Promise<{ jobId: string; text: string; dl: Download }> {
    const answer = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith(`/versions/${v1}/reports`),
    );
    const download = page.waitForEvent('download', { timeout: 150_000 });
    await reportButton().click();
    const res = await answer;
    expect(res.status()).toBe(202);
    const jobId = ((await res.json()) as { job_id: string }).job_id;
    jobs.push(jobId);
    const dl = await download;
    expect(dl.url()).toContain(`/reports/${jobId}/download`);
    const pdf = readFileSync(await dl.path());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    return { jobId, text: pdfText(pdf), dl };
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    api = await loggedIn(await newUser('refresh'));
    const context = await guardedContext(browser, {
      ignoreHTTPSErrors: true,
      storageState: await api.ctx.storageState(),
    });
    page = await context.newPage();
    const nickname = Math.random().toString(36).slice(2, 6).padEnd(4, 'x');
    projectId = await api.createProject({ name: `Report refresh ${Date.now()}`, nickname });
    const versions = (await (await api.get(`/projects/${projectId}/versions`)).json()) as {
      items: { id: string }[];
    };
    v1 = versions.items[0]!.id;
    const put = await send(api, 'patch', `/projects/${projectId}/versions/${v1}/answers`, {
      answers: [GOLDEN_VH, GOLDEN_M].map(answerBody),
    });
    expect(put.status(), await put.text()).toBe(200);
    const submit = await send(api, 'post', `/projects/${projectId}/versions/${v1}/submit`, {});
    expect(submit.status(), await submit.text()).toBe(200);
  });

  test.afterAll(async () => {
    await api.dispose();
    await page.context().close();
  });

  test('the first click builds the PDF of the first submission', async () => {
    await go(page, resultsPath());
    const { text } = await clickReport();
    expect(text).toContain(rm3(GOLDEN_VH.rm));
    // EC-MG-3 is not answered yet, so its RM is not in the PDF.
    expect(text).not.toContain(rm3(GOLDEN_VL.rm));
    await expect(steps()).toContainText(msg('shell', 'steps.reportState.ready'));
  });

  test('a repeat click with no change gets the same job and no new render', async () => {
    const { jobId } = await clickReport();
    expect(jobId).toBe(jobs[0]);
    expect(new Set(jobs).size).toBe(1);
  });

  test('after a resubmit, the click builds a new PDF with the new answer', async () => {
    // Add an answer, then submit again from the assessment page, reached on the client side.
    const put = await send(api, 'patch', `/projects/${projectId}/versions/${v1}/answers`, {
      answers: [answerBody(GOLDEN_VL)],
    });
    expect(put.status(), await put.text()).toBe(200);
    await linkTo('assess').click();
    await expect(page.getByRole('heading', { name: msg('assessment', 'title') })).toBeVisible();
    await page.getByRole('button', { name: msg('assessment', 'submit.button') }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: msg('assessment', 'submit.confirm') })
      .click();
    await expect(page).toHaveURL(new RegExp(`${escapeRe(resultsPath())}$`));

    // Step 5 no longer says the old PDF is downloaded.
    await expect(steps()).not.toContainText(msg('shell', 'steps.reportState.ready'));

    const { jobId, text } = await clickReport();
    expect(jobId).not.toBe(jobs[0]);
    expect(text).toContain(rm3(GOLDEN_VL.rm));
  });

  test('after choosing a strategy, the click builds a new PDF that shows it', async () => {
    await linkTo('plan').click();
    const main = page.getByRole('main');
    await expect(main).toContainText(GOLDEN_VH.code);
    const trigger = main.getByRole('button', {
      name: new RegExp(`\\b${escapeRe(GOLDEN_VH.code)}\\b`),
    });
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    const group = main.getByRole('radiogroup', {
      name: msg('plan', 'strategy.groupLabel', { code: GOLDEN_VH.code }),
    });
    await group.locator('label').filter({ hasText: 'REDUCE' }).click();
    await expect(
      group.getByRole('radio', { name: msg('plan', 'strategy.options.REDUCE') }),
    ).toBeChecked();
    await expect(
      main.getByText(new RegExp(escapeRe(msg('plan', 'strategy.savedAt', { at: '' })))).first(),
    ).toBeVisible();
    await expect(steps()).not.toContainText(msg('shell', 'steps.reportState.ready'));

    const before = jobs.at(-1);
    const { jobId, text } = await clickReport();
    expect(jobId).not.toBe(before);
    expect(thaiBase(text)).toContain(
      thaiBase(`${reportMsg('strategy.label')}:${reportMsg('strategy.REDUCE')}`),
    );
    // Three renders in all: first submission, resubmit, strategy.
    expect(new Set(jobs).size).toBe(3);
  });
});
