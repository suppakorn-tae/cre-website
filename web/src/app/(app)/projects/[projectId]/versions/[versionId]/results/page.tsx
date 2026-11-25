import { ResultsMocks } from '@/features/results/overview/ResultsMocks';
import { ResultsPage } from '@/features/results/overview/ResultsPage';

export default async function VersionResultsPage({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  const { projectId, versionId } = await params;
  return (
    <ResultsMocks>
      <ResultsPage projectId={projectId} versionId={versionId} />
    </ResultsMocks>
  );
}
