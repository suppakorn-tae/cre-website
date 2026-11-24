import { Suspense } from 'react';

import { SessionGate } from '@/features/shell/SessionGate';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SessionGate variant="admin">{children}</SessionGate>
    </Suspense>
  );
}
