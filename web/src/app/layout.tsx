import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';

import { MockGate } from '@/lib/mocks/mock-gate';
import { QueryProvider } from '@/lib/query/provider';
import { NonceScript } from '@/lib/security/nonce-script';
import { ThemeScript } from '@/lib/theme/theme-script';

// IBM Plex Sans Thai, self-hosted by @fontsource (no request to Google Fonts
// at build or run time). Thai and Latin come as separate files with a
// unicode-range, so a page loads only the ones it uses.
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/ibm-plex-sans-thai/700.css';
import './globals.css';

// A nonce-based CSP (proxy.ts, IO-264) needs every page rendered per request:
// a shell prerendered at build time has no request, so its scripts could not
// carry the nonce and the browser would block them. Reading the request
// headers below makes each route dynamic; `instant = false` allows that
// outside a <Suspense> boundary.
export const instant = false;

// Pages set `{page} · {context}`; the template adds the product name.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.brand');
  const name = t('name');
  return { title: { default: name, template: `%s – ${name}` } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts puts the per-request CSP nonce here; Next.js adds it to its own
  // scripts, and our two inline scripts take it from this prop.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    // The theme script sets data-theme on <html> before React hydrates, so the
    // attribute differs from the server HTML on purpose.
    <html lang="th" suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
        <NonceScript nonce={nonce} />
      </head>
      <body>
        <NextIntlClientProvider>
          <MockGate>
            <QueryProvider>{children}</QueryProvider>
          </MockGate>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
