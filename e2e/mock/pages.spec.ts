import { expect, test } from '@playwright/test';

// Ids of the sample project and its versions in web/src/features/versions/mocks.ts.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const V2 = '0193a5c2-0000-7000-8000-000000000102';

type Page = { name: string; path: string; texts: (string | RegExp)[] };

/** Each page, with text that only shows once its mock data has loaded. */
const PAGES: Page[] = [
  { name: 'dashboard', path: '/dashboard', texts: ['Dashboard', 'TK2', 'การกระจายระดับความเสี่ยง', '55 / 55 ตัวชี้วัด'] },
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
    name: 'report',
    path: `/projects/${PROJECT}/versions/${V3}/report`,
    texts: ['รายงานผลการประเมินความเสี่ยง – v3'],
  },
  { name: 'compare', path: `/projects/${PROJECT}/compare`, texts: ['เปรียบเทียบเวอร์ชัน'] },
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
    expect(new URL(page.url()).pathname).toBe(path);

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

test('the results level counts match the versions tab', async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/versions/${V3}/results`);
  // Same numbers as the "VL 8 L 14 M 20 H 11 VH 2" chips of the project page.
  const cards = page.locator('main');
  for (const [level, count] of [
    ['VH', 2],
    ['H', 11],
    ['M', 20],
    ['L', 14],
    ['VL', 8],
  ] as const) {
    await expect(cards).toContainText(new RegExp(`${level}\\s*${count}\\s*ตัวชี้วัด`));
  }
});
