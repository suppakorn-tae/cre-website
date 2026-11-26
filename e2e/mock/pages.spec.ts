import { expect, test } from '@playwright/test';

// Ids of the sample project and its versions in web/src/features/versions/mocks.ts.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const V2 = '0193a5c2-0000-7000-8000-000000000102';

type Page = { name: string; path: string; texts: (string | RegExp)[] };

/** Each page, with text that only shows once its mock data has loaded. */
const PAGES: Page[] = [
  {
    name: 'dashboard',
    path: '/dashboard',
    texts: ['Dashboard', 'TK2', 'การกระจายระดับความเสี่ยง', '55 / 55 ตัวชี้วัด'],
  },
  {
    name: 'projects',
    path: '/projects',
    texts: ['โครงการของฉัน', 'ท่าเรือเกาะเต่า ระยะที่ 2'],
  },
  {
    name: 'project',
    path: `/projects/${PROJECT}`,
    texts: ['ท่าเรือเกาะเต่า ระยะที่ 2', 'เวอร์ชันล่าสุด', /H\s*11/],
  },
  { name: 'project edit', path: `/projects/${PROJECT}/edit`, texts: ['แก้ไขโครงการ'] },
  { name: 'new project', path: '/projects/new', texts: ['สร้างโครงการก่อสร้างใหม่'] },
  {
    name: 'assessment',
    path: `/projects/${PROJECT}/versions/${V3}/assess`,
    // The submitted version comes with its answers.
    texts: ['ประเมินความเสี่ยง', 'ตอบครบ 55 จาก 55 ตัวชี้วัด', 'EC-MG-1'],
  },
  {
    name: 'assessment of the older version',
    path: `/projects/${PROJECT}/versions/${V2}/assess`,
    texts: ['ตอบครบ 55 จาก 55 ตัวชี้วัด'],
  },
  {
    name: 'results',
    path: `/projects/${PROJECT}/versions/${V3}/results`,
    texts: ['ผลการประเมินความเสี่ยง – v3', 'ความเสี่ยงสูง', 'Heat Map'],
  },
  {
    name: 'project versions tab',
    path: `/projects/${PROJECT}?tab=versions`,
    texts: ['v3 เทียบกับ', 'แนวโน้มข้ามเวอร์ชัน', 'การกระจายระดับความเสี่ยงของแต่ละเวอร์ชัน (55 ตัวชี้วัด)'],
  },
  {
    name: 'project versions tab, RM per indicator',
    path: `/projects/${PROJECT}?tab=versions&view=rm`,
    texts: ['RM รายตัวชี้วัด', 'เลือกแล้ว 4 จาก 10'],
  },
  { name: 'account', path: '/account', texts: ['บัญชีของฉัน', 'วิธีเข้าสู่ระบบ'] },
  { name: 'admin users', path: '/admin/users', texts: ['จัดการผู้ใช้', 'engineer20@example.co.th'] },
  {
    name: 'admin user',
    path: `/admin/users/${PROJECT}`,
    texts: ['ข้อมูลบัญชี', 'มหาวิทยาลัยทักษิณ'],
  },
  { name: 'admin thresholds', path: '/admin/thresholds', texts: ['เกณฑ์ RL (a–e)', 'EC-MG-1'] },
  { name: 'admin impact', path: '/admin/impact-thresholds', texts: ['เกณฑ์ผลกระทบ'] },
  { name: 'admin advice', path: '/admin/advice', texts: ['คำแนะนำตัวชี้วัด', 'EC-MG-1'] },
  { name: 'admin audit', path: '/admin/audit', texts: ['บันทึกการกระทำ', 'เปลี่ยนบทบาท'] },
  { name: 'admin export', path: '/admin/export', texts: ['ส่งออกข้อมูลวิจัย'] },
];

for (const { name, path, texts } of PAGES) {
  test(`${name} renders with mock data and no api`, async ({ page }) => {
    const crashes: string[] = [];
    page.on('pageerror', (error) => crashes.push(error.message));

    await page.goto(path);
    for (const text of texts) {
      // The first match can sit in a menu or option list that is hidden at this width.
      await expect(page.getByText(text).and(page.locator(':visible')).first()).toBeVisible();
    }
    // Not sent to the login page: the mock session is signed in.
    expect(new URL(page.url()).pathname).toBe(path.split('?')[0]);

    // The server guard used to call the api container and crash with ENOTFOUND.
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/ENOTFOUND|fetch failed|getaddrinfo/);
    expect(crashes).toEqual([]);
  });
}

test('the account page loads the profile', async ({ page }) => {
  await page.goto('/account');
  await expect(page.getByLabel(/องค์กร/)).toHaveValue('บริษัท สยามก่อสร้าง จำกัด');
});

test('the RL thresholds show decreasing indicators as inverse', async ({ page }) => {
  await page.goto('/admin/thresholds');
  for (const code of ['EC-MG-5', 'EC-CO-5', 'EC-RS-1']) {
    const row = page.getByRole('row').filter({ hasText: code });
    await expect(row).toContainText('ผกผัน');
    await expect(row).not.toContainText('ปกติ');
  }
});

test('the old compare page redirects to the RM view of the versions tab', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/compare`);
  await expect(page).toHaveURL(new RegExp(`/projects/${PROJECT}\\?tab=versions&view=rm$`));
  await expect(page.getByRole('radio', { name: 'RM รายตัวชี้วัด' })).toBeChecked();
});

test('the versions tab keeps its tab and view in the URL and selects a card without leaving', async ({
  page,
}) => {
  await page.goto(`/projects/${PROJECT}`);
  await page.getByRole('tab', { name: /เวอร์ชัน/ }).click();
  await expect(page).toHaveURL(/\?tab=versions$/);
  await page.getByText('RM รายตัวชี้วัด', { exact: true }).click();
  await expect(page).toHaveURL(/\?tab=versions&view=rm$/);

  // A click on a card picks the version to compare; it does not navigate.
  await page.getByRole('button', { name: /^v2\s*สร้าง/ }).click();
  await expect(page.getByLabel('v2 เทียบกับ')).toBeVisible();
  await expect(page).toHaveURL(/\?tab=versions&view=rm$/);

  // The never-submitted version explains itself instead of comparing.
  await page.getByRole('button', { name: /^v1\s*สร้าง/ }).click();
  await expect(page.getByText('ยังไม่มีผลการประเมิน')).toBeVisible();
});

test('the results level counts match the versions tab', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}?tab=versions`);
  const v3Card = page.getByRole('button', { name: /^v3\s*สร้าง/ });
  await expect(v3Card).toContainText(/VH\s*2/);
  await expect(v3Card).toContainText(/H\s*11/);

  await page.goto(`/projects/${PROJECT}/versions/${V3}/results`);
  // Same numbers as the "VH 2 H 11" chips of the version card, read from the level tiles.
  const counts = page.getByRole('group', { name: 'จำนวนตัวชี้วัดแต่ละระดับ' });
  for (const [level, count] of [
    ['VH', 2],
    ['H', 11],
    ['M', 20],
    ['L', 14],
    ['VL', 8],
  ] as const) {
    await expect(counts.locator(`[data-level="${level}"]`)).toContainText(
      new RegExp(`(^|\\D)${count}\\s*ตัวชี้วัด`),
    );
  }
});
