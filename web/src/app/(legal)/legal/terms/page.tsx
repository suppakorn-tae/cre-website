import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { LegalDocument } from '@/features/legal/LegalDocument';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.meta');
  return { title: t('termsTitle') };
}

export default function TermsPage() {
  return <LegalDocument doc="terms" />;
}
