import { test as base, expect } from '@playwright/test';

export * from '@playwright/test';

declare global {
  interface Window {
    __e2eCspViolation?: (violation: string) => void;
  }
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
      await use();
      expect(violations, 'Content Security Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});
