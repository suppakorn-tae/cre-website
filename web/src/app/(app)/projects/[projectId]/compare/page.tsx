import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { projectTitleData } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
import { ContentSkeleton } from '@/features/shell/Skeletons';
import { CompareMocks } from '@/features/compare/CompareMocks';
import { CompareView } from '@/features/compare/CompareView';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const [t, project] = await Promise.all([
    getTranslations('compare.meta'),
    projectTitleData(projectId),
  ]);
  return { title: pageTitle(t('title'), project?.nickname) };
}

export default function ComparePage({ params }: { params: Promise<{ projectId: string }> }) {
  // Reading `params` ties the output to one URL, so it waits inside the
  // boundary and the shell around it can prerender.
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <CompareContent params={params} />
    </Suspense>
  );
}

async function CompareContent({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <CompareMocks>
      <CompareView projectId={projectId} />
    </CompareMocks>
  );
}
