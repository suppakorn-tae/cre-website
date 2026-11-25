import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { MockGate } from '@/lib/mocks/mock-gate';
import { QueryProvider } from '@/lib/query/provider';

import './globals.css';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  display: 'swap',
});

// Pages set `{page} · {context}`; the template adds the product name.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shell.brand');
  const name = t('name');
  return { title: { default: name, template: `%s – ${name}` } };
}

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
