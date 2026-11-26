import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { ContentSkeleton } from '@/features/shell/Skeletons';
import { AdvicePage } from '@/features/admin/advice/AdvicePage';

type SearchParams = Promise<{ indicator?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin-advice.meta');
  return { title: t('title') };
}

export default function AdminAdviceRoute({ searchParams }: { searchParams: SearchParams }) {
  // Reading `searchParams` ties the output to one URL, so it waits inside the
  // boundary and the shell around it can prerender.
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <AdviceContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdviceContent({ searchParams }: { searchParams: SearchParams }) {
  const { indicator } = await searchParams;
  return <AdvicePage initialCode={typeof indicator === 'string' ? indicator : undefined} />;
}
