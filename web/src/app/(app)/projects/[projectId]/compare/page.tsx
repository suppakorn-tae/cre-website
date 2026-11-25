import { CompareMocks } from '@/features/compare/CompareMocks';
import { CompareView } from '@/features/compare/CompareView';

export default async function ComparePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <CompareMocks>
      <CompareView projectId={projectId} />
    </CompareMocks>
  );
}
