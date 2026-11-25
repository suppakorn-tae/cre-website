import { AdminUserMocks } from '@/features/admin/users/AdminUserMocks';
import { UserList } from '@/features/admin/users/UserList';

export default function AdminUsersPage() {
  return (
    <AdminUserMocks>
      <UserList />
    </AdminUserMocks>
  );
}
