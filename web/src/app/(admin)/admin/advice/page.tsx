import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AdvicePage } from '@/features/admin/advice/AdvicePage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin-advice.meta');
  return { title: t('title') };
}

export default async function AdminAdviceRoute({
  searchParams,
}: {
  searchParams: Promise<{ indicator?: string | string[] }>;
}) {
  const { indicator } = await searchParams;
  return <AdvicePage initialCode={typeof indicator === 'string' ? indicator : undefined} />;
}
