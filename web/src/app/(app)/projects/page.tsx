import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ProjectList } from '@/features/projects/ProjectList';
import { ProjectMocks } from '@/features/projects/ProjectMocks';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('projects.meta');
  return { title: t('list') };
}

export default function ProjectsPage() {
  return (
    <ProjectMocks>
      <ProjectList />
    </ProjectMocks>
  );
}
