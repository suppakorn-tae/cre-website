import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AdminThresholdMocks } from '@/features/admin/thresholds/AdminThresholdMocks';
import { ImpactPage } from '@/features/admin/thresholds/ImpactPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin-thresholds.meta');
  return { title: t('impact') };
}

export default function AdminImpactThresholdsPage() {
  return (
    <AdminThresholdMocks>
      <ImpactPage />
    </AdminThresholdMocks>
  );
}
