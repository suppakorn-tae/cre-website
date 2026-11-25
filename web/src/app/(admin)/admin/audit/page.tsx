import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AuditLog } from '@/features/admin/audit/AuditLog';
import { AuditMocks } from '@/features/admin/audit/AuditMocks';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin-audit.meta');
  return { title: t('title') };
}

export default function AdminAuditPage() {
  return (
    <AuditMocks>
      <AuditLog />
    </AuditMocks>
  );
}
