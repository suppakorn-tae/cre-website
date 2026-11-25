import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ExportMocks } from '@/features/admin/export/ExportMocks';
import { ExportPage } from '@/features/admin/export/ExportPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin-export.meta');
  return { title: t('title') };
}

export default function AdminExportPage() {
  return (
    <ExportMocks>
      <ExportPage />
    </ExportMocks>
  );
}
