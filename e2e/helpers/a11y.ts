import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** WCAG 2.2 AA: every level A and AA rule set up to 2.2. Best practices stay off. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * A violation that is real, has its own Linear issue, and is let through until
 * that issue is fixed. It matches one rule on named elements only, so the
 * other rules still run on them. Delete the entry in the fix PR.
 */
export type KnownIssue = {
  /** The axe rule id. */
  rule: string;
  /** Matches the axe target (CSS selector) of the elements the issue covers. */
  target: RegExp;
  /** The Linear issue that fixes it. */
  issue: `IO-${number}`;
  /** A page where the violation shows, and text that shows once it has loaded. */
  probe: string;
  ready: string;
};

const PROJECT = '0193a5c2-7b1e-7c3a-9d4f-000000000001';

export const KNOWN_ISSUES: KnownIssue[] = [
  // IO-219: aria-label does not contain the visible text (WCAG 2.5.3): the brand link, the
  // account menu button (Radix id), the dashboard row actions, the results factor hit
  // buttons and the versions level link.
  {
    rule: 'label-content-name-mismatch',
    target: /__brand$|^#radix-_R_\w+_$|__actionText\[aria-label=|__factorHit\[|__levelLink$/,
    issue: 'IO-219',
    probe: '/dashboard',
    ready: '55 / 55 ตัวชี้วัด',
  },
  // IO-220: the breadcrumb, back and "nav" links differ from the text around them by
  // colour only (WCAG 1.4.1).
  {
    rule: 'link-in-text-block',
    target:
      /__breadcrumb > a\[href\$="(dashboard|users)"\]$|^nav > a\[href\$="dashboard"\]$|^\.hover\\:underline\.text-blue-700(\.no-underline|\[href\$="dashboard"\])$/,
    issue: 'IO-220',
    probe: `/projects/${PROJECT}`,
    ready: 'เวอร์ชันล่าสุด',
  },
];

/** True when a KnownIssue covers this axe node (position suffixes like :nth-child are ignored). */
export function isKnown(rule: string, target: readonly unknown[]): boolean {
  const selector = target.map(String).join(' ').replace(/:nth-child\(\d+\)/g, '');
  return KNOWN_ISSUES.some((k) => k.rule === rule && k.target.test(selector));
}

/**
 * Scans the page as it is now and fails with one readable line per violation.
 * Never disables a rule: only the elements of a KNOWN_ISSUES entry are let
 * through.
 */
export async function expectNoViolations(page: Page, label: string) {
  // Scan the settled page: axe reads colours, which are wrong halfway through a fade-in.
  await page.evaluate(() =>
    Promise.allSettled(document.getAnimations().map((animation) => animation.finished)),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const lines = violations.flatMap((v) =>
    v.nodes
      .filter((n) => !isKnown(v.id, n.target))
      .map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')} -- ${v.help}`),
  );
  expect(lines, `${label}: axe violations`).toEqual([]);
}
