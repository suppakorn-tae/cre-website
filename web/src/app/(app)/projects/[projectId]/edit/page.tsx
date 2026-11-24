import { EditProjectPage } from '@/features/projects/ProjectFormPages';

export default async function EditProjectRoute({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <EditProjectPage projectId={projectId} />;
}
