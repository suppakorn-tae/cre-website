import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AdminUserMocks } from '@/features/admin/users/AdminUserMocks';
import { UserList } from '@/features/admin/users/UserList';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin-users.meta');
  return { title: t('list') };
}

export default function AdminUsersPage() {
  return (
    <AdminUserMocks>
      <UserList />
    </AdminUserMocks>
  );
}
