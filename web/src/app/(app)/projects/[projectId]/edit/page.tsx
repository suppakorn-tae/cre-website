import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { projectTitleData } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
import { EditProjectPage } from '@/features/projects/ProjectFormPages';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const [t, project] = await Promise.all([
    getTranslations('projects.meta'),
    projectTitleData(projectId),
  ]);
  return { title: pageTitle(t('edit'), project?.nickname) };
}

export default async function EditProjectRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EditProjectPage projectId={projectId} />;
}
