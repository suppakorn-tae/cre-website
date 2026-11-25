import { ReportMocks } from '@/features/reports/ReportMocks';
import { ReportPage } from '@/features/reports/ReportPage';

export default async function VersionReportPage({
  params,
}: {
  params: Promise<{ projectId: string; versionId: string }>;
}) {
  const { projectId, versionId } = await params;
  return (
    <ReportMocks>
      <ReportPage projectId={projectId} versionId={versionId} />
    </ReportMocks>
  );
}
