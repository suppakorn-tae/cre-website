import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { adminUserEmail } from '@/lib/meta/context';
import { pageTitle } from '@/lib/meta/title';
import { ContentSkeleton } from '@/features/shell/Skeletons';
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

export default function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  // Reading `params` ties the output to one URL, so it waits inside the
  // boundary and the shell around it can prerender.
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <AdminUserContent params={params} />
    </Suspense>
  );
}

async function AdminUserContent({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <AdminUserMocks>
      <UserDetail userId={userId} />
    </AdminUserMocks>
  );
}
