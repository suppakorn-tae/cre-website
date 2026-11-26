import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { versionTitleContext } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
import { ContentSkeleton } from '@/features/shell/Skeletons';
import { ReportMocks } from '@/features/reports/ReportMocks';
import { ReportPage } from '@/features/reports/ReportPage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}): Promise<Metadata> {
  const { projectId, versionId } = await params;
  const [t, context] = await Promise.all([
    getTranslations('reports.meta'),
    versionTitleContext(projectId, versionId),
  ]);
  return { title: pageTitle(t('title'), context) };
}

export default function VersionReportPage({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  // Reading `params` ties the output to one URL, so it waits inside the
  // boundary and the shell around it can prerender.
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <ReportContent params={params} />
    </Suspense>
  );
}

async function ReportContent({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  const { projectId, versionId } = await params;
  return (
    <ReportMocks>
      <ReportPage projectId={projectId} versionId={versionId} />
    </ReportMocks>
  );
}
