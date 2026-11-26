import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { versionTitleContext } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
import { ContentSkeleton } from '@/features/shell/Skeletons';
import { ResultsMocks } from '@/features/results/overview/ResultsMocks';
import { ResultsPage } from '@/features/results/overview/ResultsPage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}): Promise<Metadata> {
  const { projectId, versionId } = await params;
  const [t, context] = await Promise.all([
    getTranslations('results.meta'),
    versionTitleContext(projectId, versionId),
  ]);
  return { title: pageTitle(t('title'), context) };
}

export default function VersionResultsPage({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  // Reading `params` ties the output to one URL, so it waits inside the
  // boundary and the shell around it can prerender.
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <ResultsContent params={params} />
    </Suspense>
  );
}

async function ResultsContent({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  const { projectId, versionId } = await params;
  return (
    <ResultsMocks>
      <ResultsPage projectId={projectId} versionId={versionId} />
    </ResultsMocks>
  );
}
