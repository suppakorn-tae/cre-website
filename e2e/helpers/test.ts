import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from '@playwright/test';

export * from '@playwright/test';

declare global {
  interface Window {
    __e2eCspViolation?: (violation: string) => void;
  }
}

// CSP violations of the extra contexts made by `guardedContext`. The guard
// fixture drains them when the test that is running ends.
const extraContexts = new Map<BrowserContext, string[]>();

/** Report browser CSP violations of every page in `context` into `violations`. */
async function watchCsp(context: BrowserContext, violations: string[]) {
  await context.exposeBinding('__e2eCspViolation', (_source, violation: string) => {
    violations.push(violation);
  });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const where = e.sourceFile ? ` at ${e.sourceFile}:${e.lineNumber}` : '';
      const what = e.blockedURI || e.sample || 'inline';
      void window.__e2eCspViolation?.(
        `${e.effectiveDirective} blocked ${what}${where} on ${e.documentURI}`,
      );
    });
  });
}

/**
 * `browser.newContext()` with the same CSP guard as the `page` fixture. Use it
 * for a second device or a signed-in session: a violation on any of its pages
 * fails the test that is running when the guard checks (the end of the test).
 */
export async function guardedContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...options });
  const violations: string[] = [];
  extraContexts.set(context, violations);
  context.on('close', () => {
    // Keep what a closed context saw until the guard reports it.
    if (violations.length === 0) extraContexts.delete(context);
  });
  await watchCsp(context, violations);
  return context;
}

/**
 * `test` with a Content Security Policy guard (IO-264). Every spec imports it
 * from here instead of `@playwright/test`, so every page any test opens fails
 * the test when the browser reports a `securitypolicyviolation`: a blocked
 * script, style, font, image, connection or worker.
 */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ context }, use) => {
      const violations: string[] = [];
      await watchCsp(context, violations);
      await use();
      for (const [extra, seen] of extraContexts) {
        violations.push(...seen.splice(0));
        if (extra.pages().length === 0) extraContexts.delete(extra);
      }
      expect(violations, 'Content Security Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});
