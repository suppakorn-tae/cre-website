import { SessionGate } from '@/features/shell/SessionGate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <SessionGate variant="admin">{children}</SessionGate>;
}
