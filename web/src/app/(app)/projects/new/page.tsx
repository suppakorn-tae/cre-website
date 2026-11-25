import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CreateProjectPage } from '@/features/projects/ProjectFormPages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('projects.meta');
  return { title: t('create') };
}

export default function NewProjectPage() {
  return <CreateProjectPage />;
}
