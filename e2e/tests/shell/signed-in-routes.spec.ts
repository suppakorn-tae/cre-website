import { expect, test, type Page } from '../../helpers/test';
import { loggedIn } from '../../helpers/api';
import { ADMIN, USER } from '../../helpers/env';
import { answerBody, go, json, send, VH_ANSWER } from '../admin/support';
import { msg } from '../assessment/support';
import { shellText } from '../auth/support';

test.describe.configure({ timeout: 120_000 });
test.use({ actionTimeout: 20_000, navigationTimeout: 45_000 });

/** Record every console error and uncaught page error while `visit` runs. */
async function consoleErrorsDuring(page: Page, visit: () => Promise<void>) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await visit();
  return errors;
}

test('signed-in routes load without console errors', async ({ browser }) => {
  // A project with one answered, submitted version, so every page has data.
  const user = await loggedIn(USER);
  const projectId = await user.createProject({ name: `Shell e2e ${Date.now()}` });
  const created = await json<{ id: string }>(
    await send(user, 'post', `/projects/${projectId}/versions`, {}),
    201,
  );
  const base = `/projects/${projectId}/versions/${created.id}`;
  const put = await send(user, 'patch', `${base}/answers`, { answers: [answerBody(VH_ANSWER)] });
  expect(put.status(), await put.text()).toBe(200);
  const sub = await send(user, 'post', `${base}/submit`, {});
  expect(sub.status(), await sub.text()).toBe(200);

  const userContext = await browser.newContext({ storageState: await user.ctx.storageState() });
  const userPage = await userContext.newPage();
  const userErrors = await consoleErrorsDuring(userPage, async () => {
    for (const path of [
      '/dashboard',
      `/projects/${projectId}`,
      `${base}/assess`,
      `${base}/results`,
      '/account',
    ]) {
      await go(userPage, path);
      await expect(userPage.locator('main#main')).toBeVisible();
      // Wait for the session boundary to resolve and the page to settle.
      await expect(
        userPage.getByRole('button', { name: shellText('account.menuLabel') }),
      ).toBeVisible();
      await userPage.waitForLoadState('networkidle');
    }
  });
  expect(userErrors).toEqual([]);

  const admin = await loggedIn(ADMIN);
  const adminContext = await browser.newContext({ storageState: await admin.ctx.storageState() });
  const adminPage = await adminContext.newPage();
  const adminErrors = await consoleErrorsDuring(adminPage, async () => {
    await go(adminPage, '/admin/users');
    await expect(adminPage.getByTestId('admin-badge')).toBeVisible();
    await adminPage.waitForLoadState('networkidle');
  });
  expect(adminErrors).toEqual([]);

  await Promise.all([user.dispose(), admin.dispose(), userContext.close(), adminContext.close()]);
});

test('a signed-out visit goes to the log-in page', async ({ page }) => {
  await go(page, '/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('a non-admin gets a 404 on the admin area', async ({ browser }) => {
  const user = await loggedIn(USER);
  const context = await browser.newContext({ storageState: await user.ctx.storageState() });
  const page = await context.newPage();
  await go(page, '/admin/users');
  await expect(page.getByTestId('admin-badge')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: msg('common', 'meta.notFound') })).toBeVisible();
  // The admin side menu is never sent to a non-admin.
  await expect(page.getByRole('navigation', { name: shellText('adminNav.label') })).toHaveCount(0);
  await Promise.all([user.dispose(), context.close()]);
});
