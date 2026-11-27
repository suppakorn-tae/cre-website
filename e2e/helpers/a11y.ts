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
};

export const KNOWN_ISSUES: KnownIssue[] = [
  // IO-219: aria-label does not contain the visible text (WCAG 2.5.3): brand link, account
  // menu button, dashboard row actions, results factor hit buttons, versions level link.
  {
    rule: 'label-content-name-mismatch',
    target: /brand|^#radix-|actionText|factorHit|levelLink/,
    issue: 'IO-219',
  },
  // IO-220: breadcrumb and back links differ from the text around them by colour only
  // (WCAG 1.4.1).
  {
    rule: 'link-in-text-block',
    target: /breadcrumb|a\[href\$="(dashboard|users)"\]|text-blue-700/,
    issue: 'IO-220',
  },
];

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
      .filter((n) => {
        const target = n.target.join(' ');
        return !KNOWN_ISSUES.some((k) => k.rule === v.id && k.target.test(target));
      })
      .map((n) => `${v.id} (${v.impact}): ${n.target.join(' ')} -- ${v.help}`),
  );
  expect(lines, `${label}: axe violations`).toEqual([]);
}
