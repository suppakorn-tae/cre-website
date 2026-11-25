import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AdminThresholdMocks } from '@/features/admin/thresholds/AdminThresholdMocks';
import { ThresholdsPage } from '@/features/admin/thresholds/ThresholdsPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin-thresholds.meta');
  return { title: t('thresholds') };
}

export default function AdminThresholdsPage() {
  return (
    <AdminThresholdMocks>
      <ThresholdsPage />
    </AdminThresholdMocks>
  );
}
