import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { projectTitleData } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
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

export default async function ComparePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <CompareMocks>
      <CompareView projectId={projectId} />
    </CompareMocks>
  );
}
