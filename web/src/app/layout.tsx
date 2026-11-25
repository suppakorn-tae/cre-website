import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { MockGate } from '@/lib/mocks/mock-gate';
import { QueryProvider } from '@/lib/query/provider';

// IBM Plex Sans Thai, self-hosted by @fontsource (no request to Google Fonts
// at build or run time). Thai and Latin come as separate files with a
// unicode-range, so a page loads only the ones it uses.
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/ibm-plex-sans-thai/700.css';
import './globals.css';

// Pages set `{page} · {context}`; the template adds the product name.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.brand');
  const name = t('name');
  return { title: { default: name, template: `%s – ${name}` } };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
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
