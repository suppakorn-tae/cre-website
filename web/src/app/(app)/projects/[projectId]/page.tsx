import { ProjectDetail } from '@/features/versions/ProjectDetail';
import { VersionMocks } from '@/features/versions/VersionMocks';

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <VersionMocks>
      <ProjectDetail projectId={projectId} />
    </VersionMocks>
  );
}
