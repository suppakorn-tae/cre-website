import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The providers are not what is tested here: render their children as is.
vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));
vi.mock('@/lib/mocks/mock-gate', () => ({
  MockGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/query/provider', () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { THEME_INIT_SCRIPT } from '@/lib/theme/theme-script';

import RootLayout from './layout';

describe('root layout: no light flash in dark mode', () => {
  const markup = renderToStaticMarkup(
    <RootLayout>
      <main>page</main>
    </RootLayout>,
  );

  it('puts the theme script first in <head>, before the body and any other script', () => {
    const head = /<head>([\s\S]*?)<\/head>/.exec(markup)?.[1] ?? '';
    expect(head.startsWith('<script id="theme-init">')).toBe(true);
    expect(markup.indexOf('id="theme-init"')).toBeLessThan(markup.indexOf('<body'));
    const firstScript = /<script[^>]*>/.exec(markup)?.[0];
    expect(firstScript).toBe('<script id="theme-init">');
  });

  it('inlines the script, so it runs before hydration with no request', () => {
    expect(markup).toContain(THEME_INIT_SCRIPT);
    expect(markup).not.toMatch(/<script[^>]*id="theme-init"[^>]*\b(src|async|defer|type)=/);
  });
});
