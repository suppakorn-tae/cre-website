import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { versionTitleContext } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
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

export default async function VersionResultsPage({
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
