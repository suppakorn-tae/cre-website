import { AuditLog } from '@/features/admin/audit/AuditLog';
import { AuditMocks } from '@/features/admin/audit/AuditMocks';

export default function AdminAuditPage() {
  return (
    <AuditMocks>
      <AuditLog />
    </AuditMocks>
  );
}
