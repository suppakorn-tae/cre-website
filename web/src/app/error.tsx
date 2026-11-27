'use client';

import { useTranslations } from 'next-intl';

import { ThemeSync } from '@/features/shell/ThemeSync';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const meta = useTranslations('common.meta');
  const t = useTranslations('common.pageState');
  const brand = useTranslations('shell.brand')('name');
  const title = meta('error');
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 16px' }}>
      <ThemeSync />
      {/* React hoists this to <head>; the root template does not apply to it. */}
      <title>{`${title} – ${brand}`}</title>
      <h1>{title}</h1>
      <p>
        <button type="button" onClick={reset}>
          {t('retry')}
        </button>
      </p>
    </main>
  );
}
