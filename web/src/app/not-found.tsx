import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { AFTER_LOGIN_PATH } from '@/features/auth/login/paths';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common.meta');
  return { title: t('notFound') };
}

export default async function NotFound() {
  const meta = await getTranslations('common.meta');
  const t = await getTranslations('common.pageState');
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 16px' }}>
      <h1>{meta('notFound')}</h1>
      <p>
        <Link href={AFTER_LOGIN_PATH}>{t('backToDashboard')}</Link>
      </p>
    </main>
  );
}
