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
const { NONCE } = vi.hoisted(() => ({ NONCE: 'dGVzdC1ub25jZS0xMjM0NQ==' }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-nonce': NONCE }),
}));

import { THEME_INIT_SCRIPT } from '@/lib/theme/theme-script';

import { NONCE_INIT_SCRIPT } from '@/lib/security/nonce-script';

import RootLayout from './layout';

const render = async () => renderToStaticMarkup(await RootLayout({ children: <main>page</main> }));

describe('root layout: no light flash in dark mode', async () => {
  const markup = await render();

  it('puts the theme script first in <head>, before the body and any other script', () => {
    const head = /<head>([\s\S]*?)<\/head>/.exec(markup)?.[1] ?? '';
    expect(head.startsWith(`<script id="theme-init" nonce="${NONCE}">`)).toBe(true);
    expect(markup.indexOf('id="theme-init"')).toBeLessThan(markup.indexOf('<body'));
    const firstScript = /<script[^>]*>/.exec(markup)?.[0];
    expect(firstScript).toBe(`<script id="theme-init" nonce="${NONCE}">`);
  });

  it('inlines the script, so it runs before hydration with no request', () => {
    expect(markup).toContain(THEME_INIT_SCRIPT);
    expect(markup).not.toMatch(/<script[^>]*id="theme-init"[^>]*\b(src|async|defer|type)=/);
  });
});

describe('root layout: content security policy nonce (IO-264)', async () => {
  const markup = await render();

  it('puts the request nonce on every inline script it renders', () => {
    const scripts = markup.match(/<script[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${NONCE}"`);
  });

  it('hands the nonce to run-time style tags from the nonced script itself', () => {
    expect(markup).toContain(NONCE_INIT_SCRIPT);
    // The value is not written into the page a second time.
    expect(markup.split(NONCE).length - 1).toBe(2);
  });
});
