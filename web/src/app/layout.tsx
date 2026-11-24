import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';

import { MockGate } from '@/lib/mocks/mock-gate';
import { QueryProvider } from '@/lib/query/provider';

import './globals.css';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CRE',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoSansThai.className}>
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
