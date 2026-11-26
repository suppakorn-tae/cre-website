import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { PlanPage } from '@/features/plan/PlanPage';
import { ResultsMocks } from '@/features/results/overview/ResultsMocks';
import { ContentSkeleton } from '@/features/shell/Skeletons';
import { versionTitleContext } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}): Promise<Metadata> {
  const { projectId, versionId } = await params;
  const [t, context] = await Promise.all([
    getTranslations('plan.meta'),
    versionTitleContext(projectId, versionId),
  ]);
  return { title: pageTitle(t('title'), context) };
}

export default function VersionPlanPage({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  // Reading `params` ties the output to one URL, so it waits inside the
  // boundary and the shell around it can prerender.
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <PlanContent params={params} />
    </Suspense>
  );
}

async function PlanContent({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  const { projectId, versionId } = await params;
  return (
    <ResultsMocks>
      <PlanPage projectId={projectId} versionId={versionId} />
    </ResultsMocks>
  );
}
