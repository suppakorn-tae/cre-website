import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Suspense } from 'react';

import { GoogleFinish } from '@/features/auth/register/GoogleFinish';

// The Google callback redirects here with `?result=`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return { title: t('register') };
}

export default function RegisterGooglePage() {
  return (
    <Suspense>
      <GoogleFinish />
    </Suspense>
  );
}
