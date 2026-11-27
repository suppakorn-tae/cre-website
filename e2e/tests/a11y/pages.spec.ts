import { expect, test, type Page } from '@playwright/test';

import AxeBuilder from '@axe-core/playwright';

import { expectNoViolations, isKnown, KNOWN_ISSUES, WCAG_TAGS } from '../../helpers/a11y';

// Mock mode (see playwright.mock.config.ts). The sample project and versions
// are in web/src/features/versions/mocks.ts.
const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const V3 = '0193a5c2-0000-7000-8000-000000000103';
const V2 = '0193a5c2-0000-7000-8000-000000000102';
const V1 = '0193a5c2-0000-7000-8000-000000000101';
const ASSESS = `/projects/${PROJECT}/versions/${V3}/assess`;

const WIDTHS = [375, 1280] as const;

type Route = {
  name: string;
  path: string;
  /** Text that only shows once the mock data has loaded. */
  ready: string | RegExp;
  /** Opens one more state of the page; scanned in addition to the page itself. */
  states?: Record<string, (page: Page) => Promise<void>>;
};

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).and(page.locator(':visible')).first();

/**
 * Opens every popover trigger of the page in turn (Select, MultiSelect, DatePicker,
 * menus) and scans with it open.
 */
async function eachPopover(page: Page, label: string) {
  // The account menu is left out: Radix sets aria-hidden on the page behind an open modal menu
  // and traps focus in it, which axe still reports as aria-hidden-focus (a known false
  // positive of Radix modal menus). Every other trigger on the page is opened, at most
  // four per page (the assessment has one y3 picker per row).
  const triggers = page.locator(
    '[aria-haspopup]:not([aria-haspopup="false"], [aria-haspopup="menu"]):visible:enabled',
  );
  const count = Math.min(await triggers.count(), 4);
  expect(count, `${label}: expected at least one popover trigger`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expectNoViolations(page, `${label}: popover ${i + 1} of ${count} open`);
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  }
}

const popovers = { 'every popover open': (page: Page) => eachPopover(page, 'popovers') };

const ROUTES: Route[] = [
  { name: 'login', path: '/login', ready: 'เข้าสู่ระบบ' },
  { name: 'register', path: '/register', ready: /สมัครสมาชิก/ },
  { name: 'register google finish', path: '/register/google', ready: /./ },
  { name: 'forgot password', path: '/forgot-password', ready: /รหัสผ่าน/ },
  { name: 'legal terms', path: '/legal/terms', ready: /./ },
  { name: 'legal retention', path: '/legal/retention', ready: /./ },
  {
    name: 'dashboard',
    path: '/dashboard',
    ready: '55 / 55 ตัวชี้วัด',
    states: {
      'indicators panel': async (page) => {
        await page
          .getByRole('button', { name: /ความเสี่ยงสูง/ })
          .first()
          .click();
        await expect(page.getByText('Top 10 ตัวชี้วัดที่เป็น H / VH บ่อยที่สุด')).toBeVisible();
      },
      'islands panel': async (page) => {
        await page
          .getByRole('button', { name: /เกาะที่ดำเนินการ/ })
          .first()
          .click();
        await expect(page.getByText('โครงการแยกตามเกาะ')).toBeVisible();
      },
    },
  },
  { name: 'projects', path: '/projects', ready: 'ท่าเรือเกาะเต่า ระยะที่ 2' },
  { name: 'project new', path: '/projects/new', ready: 'สร้างโครงการก่อสร้างใหม่', states: popovers },
  {
    name: 'project edit',
    path: `/projects/${PROJECT}/edit`,
    ready: 'แก้ไขโครงการ',
    states: popovers,
  },
  { name: 'project overview', path: `/projects/${PROJECT}`, ready: 'เวอร์ชันล่าสุด' },
  {
    name: 'project versions tab',
    path: `/projects/${PROJECT}?tab=versions`,
    ready: 'แนวโน้มข้ามเวอร์ชัน',
  },
  {
    // The old compare page redirects to the RM view of the versions tab, so this scans
    // the page a person lands on from the compare route.
    name: 'compare (redirects to the versions tab, RM view)',
    path: `/projects/${PROJECT}/compare`,
    ready: 'RM รายตัวชี้วัด',
  },
  {
    name: 'project versions tab, RM view',
    path: `/projects/${PROJECT}?tab=versions&view=rm`,
    ready: 'RM รายตัวชี้วัด',
  },
  {
    name: 'assessment',
    path: ASSESS,
    ready: 'EC-MG-1',
    states: {
      'question popup open': async (page) => {
        const x = page.getByRole('textbox', { name: /^X .*EC-MG-1/ }).first();
        if (!(await x.isVisible())) {
          // Phone: the cards are collapsed, open the first one.
          await page
            .locator('button[aria-expanded="false"]:visible')
            .filter({ hasText: 'EC-MG-1' })
            .first()
            .click();
        }
        await x.focus();
        // The bubble is a desktop and tablet thing; the phone card shows the question differently.
        if (page.viewportSize()!.width >= 768) {
          await expect(page.locator('[data-radix-popper-content-wrapper]')).toBeVisible();
        }
      },
      'y3 picker open': async (page) => {
        await page.keyboard.press('Escape');
        await page
          .getByRole('button', { name: /^y3 .*EC-MG-1/ })
          .first()
          .click();
        await expect(page.getByRole('dialog')).toBeVisible();
      },
      'filter and unit popovers open': async (page) => {
        await page.keyboard.press('Escape');
        await eachPopover(page, 'assessment');
      },
      'cards collapsed': async (page) => {
        for (const open of await page.locator('button[aria-expanded="true"]').all()) {
          if (await open.isVisible()) await open.click();
        }
      },
      'submit dialog open': async (page) => {
        await page.getByRole('button', { name: 'ส่งผลการประเมิน' }).first().click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
      },
    },
  },
  { name: 'assessment of a draft', path: `/projects/${PROJECT}/versions/${V1}/assess`, ready: /./ },
  {
    name: 'results overview',
    path: `/projects/${PROJECT}/versions/${V3}/results`,
    ready: 'Heat Map',
  },
  {
    name: 'results table',
    path: `/projects/${PROJECT}/versions/${V3}/results?tab=table`,
    ready: 'EC-MG-1',
    states: popovers,
  },
  {
    name: 'results heat map',
    path: `/projects/${PROJECT}/versions/${V3}/results?tab=heatmap`,
    ready: /./,
  },
  {
    name: 'results H / VH',
    path: `/projects/${PROJECT}/versions/${V3}/results?tab=hvh`,
    ready: /./,
  },
  {
    name: 'risk plan',
    path: `/projects/${PROJECT}/versions/${V3}/plan`,
    ready: /คำแนะนำจัดการความเสี่ยง/,
  },
  { name: 'risk plan of v2', path: `/projects/${PROJECT}/versions/${V2}/plan`, ready: /./ },
  { name: 'account', path: '/account', ready: 'วิธีเข้าสู่ระบบ' },
  {
    name: 'admin users',
    path: '/admin/users',
    ready: 'engineer20@example.co.th',
    states: popovers,
  },
  { name: 'admin user', path: `/admin/users/${PROJECT}`, ready: 'ข้อมูลบัญชี' },
  { name: 'admin RL thresholds', path: '/admin/thresholds', ready: 'EC-MG-1' },
  { name: 'admin impact thresholds', path: '/admin/impact-thresholds', ready: 'เกณฑ์ผลกระทบ' },
  { name: 'admin advice', path: '/admin/advice', ready: 'EC-MG-1' },
  { name: 'admin audit', path: '/admin/audit', ready: 'เปลี่ยนบทบาท', states: popovers },
  { name: 'admin export', path: '/admin/export', ready: 'ส่งออกข้อมูลวิจัย' },
];

test.describe('known issues', () => {
  test.skip(({ isMobile }) => isMobile, 'one Chrome project is enough');

  // A fixed issue must lose its entry: the entry would hide a new violation later.
  for (const known of KNOWN_ISSUES) {
    test(`${known.issue} is still present (${known.rule})`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(known.probe);
      await expect(visible(page, known.ready)).toBeVisible({ timeout: 30_000 });
      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const hit = violations
        .filter((v) => v.id === known.rule)
        .flatMap((v) => v.nodes)
        .some((n) => isKnown(known.rule, n.target));
      expect(
        hit,
        `${known.issue} no longer shows on ${known.probe}: delete its entry in e2e/helpers/a11y.ts`,
      ).toBe(true);
    });
  }
});

test.describe('axe, WCAG 2.2 AA', () => {
  // The width is set by the test; one Chrome project is enough.
  test.skip(({ isMobile }) => isMobile, 'sets its own widths');
  // Pages with many states (assessment) scan up to ten times.
  test.setTimeout(90_000);

  for (const width of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route.name} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route.path);
        await expect(visible(page, route.ready)).toBeVisible();
        await expect(page.locator('[role="status"][aria-label]')).toHaveCount(0);
        await expectNoViolations(page, route.name);
        for (const [state, open] of Object.entries(route.states ?? {})) {
          await open(page);
          await expectNoViolations(page, `${route.name}, ${state}`);
        }
      });
    }
  }
});
