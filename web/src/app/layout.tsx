import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';

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

export const metadata: Metadata = {
  title: 'CRE',
};

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
