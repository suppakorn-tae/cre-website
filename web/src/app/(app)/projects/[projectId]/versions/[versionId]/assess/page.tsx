import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { versionTitleContext } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
import { AssessmentMocks } from '@/features/assessment/AssessmentMocks';
import { AssessmentPage } from '@/features/assessment/AssessmentPage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}): Promise<Metadata> {
  const { projectId, versionId } = await params;
  const [t, context] = await Promise.all([
    getTranslations('assessment.meta'),
    versionTitleContext(projectId, versionId),
  ]);
  return { title: pageTitle(t('title'), context) };
}

export default async function AssessRoute({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  const { projectId, versionId } = await params;
  return (
    <AssessmentMocks>
      <AssessmentPage projectId={projectId} versionId={versionId} />
    </AssessmentMocks>
  );
}
