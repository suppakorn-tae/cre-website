import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Suspense } from 'react';

import { AccountPage } from '@/features/account/AccountPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account.meta');
  return { title: t('title') };
}

export default function Page() {
  // The page reads `?result=` from the Google callback.
  return (
    <Suspense>
      <AccountPage />
    </Suspense>
  );
}
