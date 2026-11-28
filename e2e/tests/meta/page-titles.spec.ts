import { expect, test, type Page } from '../../helpers/test';
import { loggedIn } from '../../helpers/api';
import { ADMIN, USER } from '../../helpers/env';
import { msg } from '../assessment/support';
import { logInThroughUi, newUser } from '../auth/support';
import { json, send } from '../admin/support';

// WCAG 2.4.2: every page has its own `<title>`, `{page} · {context} – brand`.
// The titles are read from the message catalogue, not copied here.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'titles do not depend on the viewport');
});
test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

const brand = msg('shell', 'brand.name');
const title = (page: string, context?: string) =>
  `${context ? `${page} · ${context}` : page} – ${brand}`;

async function expectTitle(page: Page, path: string, expected: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page, path).toHaveTitle(expected);
}

test('signed-out pages have titles', async ({ page }) => {
  await expectTitle(page, '/login', title(msg('auth', 'meta.login')));
  await expectTitle(page, '/register', title(msg('auth', 'meta.register')));
  await expectTitle(page, '/register/google', title(msg('auth', 'meta.register')));
  await expectTitle(page, '/forgot-password', title(msg('auth', 'meta.forgotPassword')));
});

test('unknown page has the not-found title', async ({ page }) => {
  await expectTitle(page, '/no-such-page', title(msg('common', 'meta.notFound')));
});

test('signed-in pages have titles with project and version context', async ({ page }) => {
  // A new user each run: the shared seeded user would hit the project limit.
  const who = await newUser('titles');
  const api = await loggedIn(who);
  const nickname = Math.random().toString(36).slice(2, 6).padEnd(4, 'x');
  const name = `Titles ${Date.now()}`;
  const projectId = await api.createProject({ name, nickname });
  const version = await json<{ id: string; version_no: number }>(
    await send(api, 'post', `/projects/${projectId}/versions`, {}),
    201,
  );
  const v = `${nickname} v${version.version_no}`;
  const base = `/projects/${projectId}`;
  const versionBase = `${base}/versions/${version.id}`;

  await logInThroughUi(page, who.email, who.password);
  await page.waitForURL('**/dashboard');

  await expectTitle(page, '/dashboard', title(msg('dashboard', 'meta.title')));
  await expectTitle(page, '/projects', title(msg('projects', 'meta.list')));
  await expectTitle(page, '/projects/new', title(msg('projects', 'meta.create')));
  await expectTitle(page, base, title(`${nickname} ${name}`));
  await expectTitle(page, `${base}/edit`, title(msg('projects', 'meta.edit'), nickname));
  await expectTitle(page, `${versionBase}/assess`, title(msg('assessment', 'meta.title'), v));
  await expectTitle(page, `${versionBase}/results`, title(msg('results', 'meta.title'), v));
  await expectTitle(page, '/account', title(msg('account', 'meta.title')));
});

test('admin pages have titles', async ({ page }) => {
  const who = await newUser('titles');
  const admin = await loggedIn(ADMIN);
  const list = await json<{ items: { id: string }[] }>(
    await admin.get(`/admin/users?q=${encodeURIComponent(who.email)}`),
  );
  const userId = list.items[0]!.id;

  await logInThroughUi(page, ADMIN.email, ADMIN.password);
  await page.waitForURL('**/dashboard');

  const users = msg('admin-users', 'meta.list');
  await expectTitle(page, '/admin/users', title(users));
  await expectTitle(page, `/admin/users/${userId}`, title(users, who.email));
  await expectTitle(page, '/admin/advice', title(msg('admin-advice', 'meta.title')));
  await expectTitle(page, '/admin/thresholds', title(msg('admin-thresholds', 'meta.thresholds')));
  await expectTitle(
    page,
    '/admin/impact-thresholds',
    title(msg('admin-thresholds', 'meta.impact')),
  );
  await expectTitle(page, '/admin/export', title(msg('admin-export', 'meta.title')));
  await expectTitle(page, '/admin/audit', title(msg('admin-audit', 'meta.title')));
});
