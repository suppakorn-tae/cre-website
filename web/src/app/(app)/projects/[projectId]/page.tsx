import { ProjectDetail } from '@/features/versions/ProjectDetail';

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectDetail projectId={projectId} />;
}
