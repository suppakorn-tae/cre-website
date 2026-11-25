import { AdminUserMocks } from '@/features/admin/users/AdminUserMocks';
import { UserDetail } from '@/features/admin/users/UserDetail';

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <AdminUserMocks>
      <UserDetail userId={userId} />
    </AdminUserMocks>
  );
}
