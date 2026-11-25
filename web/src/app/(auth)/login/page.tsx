import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Suspense } from 'react';

import { LoginForm } from '@/features/auth/login/LoginForm';

// The Google callback may redirect here with `?result=`.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return { title: t('login') };
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
