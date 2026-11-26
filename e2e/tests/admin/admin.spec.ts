import { expect, test } from '@playwright/test';
import { loggedIn, type Api } from '../../helpers/api';
import { ADMIN } from '../../helpers/env';
import { logInThroughUi, newUser } from '../auth/support';
import {
  adminApi,
  answerBody,
  auditFor,
  go,
  json,
  send,
  unzip,
  VH_ANSWER,
  type Answer,
} from './support';

// The admin flows change shared catalogue data (advice, thresholds), so they
// run once, on the desktop project, and each test restores what it edits.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'admin API flows are viewport independent');
});
test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

type Version = { id: string };
type User = { id: string; status: string };

/** Create a project with one answered, submitted version. */
async function submitted(api: Api, answer: Answer) {
  const projectId = await api.createProject({ name: `Admin e2e ${Date.now()}` });
  const v = await json<Version>(
    await send(api, 'post', `/projects/${projectId}/versions`, {}),
    201,
  );
  const base = `/projects/${projectId}/versions/${v.id}`;
  const put = await send(api, 'patch', `${base}/answers`, { answers: [answerBody(answer)] });
  expect(put.status(), await put.text()).toBe(200);
  const sub = await send(api, 'post', `${base}/submit`, {});
  expect(sub.status(), await sub.text()).toBe(200);
  return { projectId, versionId: v.id, base };
}

async function userIdOf(admin: Api, email: string) {
  const res = await json<{ items: User[] }>(
    await admin.get(`/admin/users?q=${encodeURIComponent(email)}`),
  );
  expect(res.items).toHaveLength(1);
  return res.items[0]!.id;
}

test('deactivate a user ends the session, reactivate lets them back in (UC-14)', async ({
  page,
}) => {
  const who = await newUser('deact');
  const user = await loggedIn(who);
  const admin = await adminApi();
  try {
    const id = await userIdOf(admin, who.email);
    expect((await user.get('/auth/me')).status()).toBe(200);

    const off = await json<User>(await send(admin, 'post', `/admin/users/${id}/deactivate`));
    expect(off.status).toBe('deactivated');
    // The session the user already had stops working.
    expect((await user.get('/auth/me')).status()).toBe(401);

    // A new log-in is refused.
    await logInThroughUi(page, who.email, who.password);
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);

    const on = await json<User>(await send(admin, 'post', `/admin/users/${id}/reactivate`));
    expect(on.status).toBe('active');
    await logInThroughUi(page, who.email, who.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);

    expect(await auditFor(admin, 'user_deactivate', 'account', id)).toHaveLength(1);
    expect(await auditFor(admin, 'user_reactivate', 'account', id)).toHaveLength(1);
  } finally {
    await user.dispose();
    await admin.dispose();
  }
});

test('an advice edit shows in the results without resubmitting (UC-16)', async ({ browser }) => {
  const who = await newUser('advice');
  const user = await loggedIn(who);
  const admin = await adminApi();
  const code = VH_ANSWER.code;
  // RL is the top score of this answer (4.7 vs 4.46, 4.28, 4), so its list is the one shown.
  const list = 'RL';
  type Lists = { lists: Record<string, { text: { th: string } }[]> };
  const original = (await json<Lists>(await admin.get(`/admin/advice/${code}`))).lists[list]!;
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: await user.ctx.storageState(),
  });
  const page = await context.newPage();
  try {
    const { projectId, versionId, base } = await submitted(user, VH_ANSWER);
    const adviceOf = async () => {
      const res = await json<{
        items: { indicator_code: string; advice?: { list: string; items: string[] }[] }[];
      }>(await user.get(`${base}/results`));
      return res.items.find((i) => i.indicator_code === code)!.advice?.find((a) => a.list === list)
        ?.items;
    };
    expect(await adviceOf()).toEqual(original.map((i) => i.text.th));

    // Reorder the old items and add new ones: five is the maximum.
    const stamp = Date.now();
    const edited = [
      ...[...original].reverse().map((i) => i.text.th),
      `ข้อเพิ่มที่ 1 ${stamp}`,
      `ข้อเพิ่มที่ 2 ${stamp}`,
    ].slice(0, 5);
    const put = await send(admin, 'put', `/admin/advice/${code}/${list}`, {
      items: edited.map((th) => ({ text: { th } })),
    });
    expect(put.status(), await put.text()).toBe(200);

    // Same version, no resubmit: the results already carry the new list in order.
    expect(await adviceOf()).toEqual(edited);
    // The advice lists are on the plan page; its single H / VH item is open.
    await go(page, `/projects/${projectId}/versions/${versionId}/plan`);
    await expect(page.getByRole('main')).toContainText(edited[edited.length - 1]!);

    // Six items are refused.
    const six = await send(admin, 'put', `/admin/advice/${code}/${list}`, {
      items: Array.from({ length: 6 }, (_, n) => ({ text: { th: `ข้อ ${n}` } })),
    });
    expect(six.status()).toBe(422);

    expect((await auditFor(admin, 'advice_edit', 'indicator', code)).length).toBeGreaterThan(0);
  } finally {
    await send(admin, 'put', `/admin/advice/${code}/${list}`, { items: original });
    await context.close();
    await user.dispose();
    await admin.dispose();
  }
});

test('an RL threshold edit changes new versions only (UC-17)', async () => {
  const who = await newUser('rl');
  const user = await loggedIn(who);
  const admin = await adminApi();
  const code = 'EC-MG-4';
  type Th = { thresholds: Record<string, number | null> };
  const original = (await json<Th>(await admin.get(`/admin/rl-thresholds/${code}`))).thresholds;
  const answer: Answer = { code, x: 5.33, y1: 3, y2: 5, y3: ['A'] };
  const rlOf = async (base: string) =>
    (
      await json<{ items: { indicator_code: string; rl: number }[] }>(
        await user.get(`${base}/results`),
      )
    ).items.find((i) => i.indicator_code === code)!.rl;
  try {
    const first = await submitted(user, answer);
    const before = await rlOf(first.base);

    const doubled = Object.fromEntries(
      Object.entries(original).map(([k, v]) => [k, (v as number) * 2]),
    );
    const put = await send(admin, 'put', `/admin/rl-thresholds/${code}`, { thresholds: doubled });
    expect(put.status(), await put.text()).toBe(200);

    // The version made before the edit keeps its stored RL.
    expect(await rlOf(first.base)).toBe(before);

    // A new version of the same project uses the new thresholds.
    const v2 = await json<Version>(
      await send(user, 'post', `/projects/${first.projectId}/versions`, {}),
      201,
    );
    const base2 = `/projects/${first.projectId}/versions/${v2.id}`;
    const patch = await send(user, 'patch', `${base2}/answers`, { answers: [answerBody(answer)] });
    expect(patch.status(), await patch.text()).toBe(200);
    const sub = await send(user, 'post', `${base2}/submit`, {});
    expect(sub.status(), await sub.text()).toBe(200);
    expect(await rlOf(base2)).not.toBe(before);
    expect(await rlOf(first.base)).toBe(before);

    expect((await auditFor(admin, 'rl_threshold_edit', 'indicator', code)).length).toBeGreaterThan(
      0,
    );
  } finally {
    await send(admin, 'put', `/admin/rl-thresholds/${code}`, { thresholds: original });
    await user.dispose();
    await admin.dispose();
  }
});

test('the export ZIP has no e-mail; the audit log shows request and download (UC-18, UC-19)', async () => {
  const who = await newUser('export');
  const user = await loggedIn(who);
  const admin = await adminApi();
  try {
    await submitted(user, VH_ANSWER);
    const id = await userIdOf(admin, who.email);

    const req = await json<{ job_id?: string; id?: string }>(
      await send(admin, 'post', '/admin/exports', {
        scope: 'selected',
        user_ids: [id],
        include_deleted: false,
      }),
      202,
    );
    const jobId = (req.job_id ?? req.id)!;

    await expect
      .poll(
        async () => (await json<{ status: string }>(await admin.get(`/jobs/${jobId}`))).status,
        {
          timeout: 90_000,
          intervals: [1000],
        },
      )
      .toBe('done');

    const dl = await admin.get(`/admin/exports/${jobId}/download`);
    expect(dl.status()).toBe(200);
    const files = unzip(await dl.body());
    expect([...files.keys()].some((n) => n.endsWith('project.json'))).toBe(true);
    for (const [name, data] of files) {
      const text = data.toString('utf8');
      expect(text, name).not.toContain(who.email);
      expect(text, name).not.toContain(ADMIN.email);
      expect(text, name).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }

    expect(await auditFor(admin, 'export_request', 'export', jobId)).toHaveLength(1);
    expect(await auditFor(admin, 'export_download', 'export', jobId)).toHaveLength(1);
  } finally {
    await user.dispose();
    await admin.dispose();
  }
});
