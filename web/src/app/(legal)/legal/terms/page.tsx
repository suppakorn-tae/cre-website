import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { LegalDocument } from '@/features/legal/LegalDocument';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.meta');
  return { title: t('termsTitle') };
}

export default function TermsPage() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/cre-logo-mark.png" width={40} height={40} />
      <LegalDocument doc="terms" />
    </>
  );
}
