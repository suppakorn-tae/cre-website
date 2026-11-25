import { AdminThresholdMocks } from '@/features/admin/thresholds/AdminThresholdMocks';
import { ThresholdsPage } from '@/features/admin/thresholds/ThresholdsPage';

export default function AdminThresholdsPage() {
  return (
    <AdminThresholdMocks>
      <ThresholdsPage />
    </AdminThresholdMocks>
  );
}
