import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { projectTitleData } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
import { ContentSkeleton } from '@/features/shell/Skeletons';
import { ProjectDetail } from '@/features/versions/ProjectDetail';
import { VersionMocks } from '@/features/versions/VersionMocks';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const project = await projectTitleData(projectId);
  if (!project) return { title: (await getTranslations('projects.meta'))('list') };
  return { title: pageTitle(`${project.nickname} ${project.name}`) };
}

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  // Reading `params` ties the output to one URL, so it waits inside the
  // boundary and the shell around it can prerender.
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <ProjectContent params={params} />
    </Suspense>
  );
}

async function ProjectContent({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <VersionMocks>
      <ProjectDetail projectId={projectId} />
    </VersionMocks>
  );
}
