import { AssessmentMocks } from '@/features/assessment/AssessmentMocks';
import { AssessmentPage } from '@/features/assessment/AssessmentPage';

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
