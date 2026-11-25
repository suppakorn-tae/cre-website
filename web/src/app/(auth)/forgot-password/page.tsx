import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ForgotFlow } from '@/features/auth/reset/ForgotFlow';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return { title: t('forgotPassword') };
}

export default function ForgotPasswordPage() {
  return <ForgotFlow />;
}
