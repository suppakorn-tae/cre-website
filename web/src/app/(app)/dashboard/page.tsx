import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { DashboardMocks } from '@/features/dashboard/DashboardMocks';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.meta');
  return { title: t('title') };
}

export default function Page() {
  return (
    <DashboardMocks>
      <DashboardPage />
    </DashboardMocks>
  );
}
