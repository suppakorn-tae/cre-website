import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { RegisterFlow } from '@/features/auth/register/RegisterFlow';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return { title: t('register') };
}

export default function RegisterPage() {
  return <RegisterFlow />;
}
