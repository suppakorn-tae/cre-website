import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { adminUserEmail } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
import { AdminUserMocks } from '@/features/admin/users/AdminUserMocks';
import { UserDetail } from '@/features/admin/users/UserDetail';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const [t, email] = await Promise.all([
    getTranslations('admin-users.meta'),
    adminUserEmail(userId),
  ]);
  return { title: pageTitle(t('list'), email) };
}

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <AdminUserMocks>
      <UserDetail userId={userId} />
    </AdminUserMocks>
  );
}
