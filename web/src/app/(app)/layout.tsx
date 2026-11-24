import { Suspense } from 'react';

import { SessionGate } from '@/features/shell/SessionGate';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // The guard reads the session cookie per request, so it streams in a boundary.
  return (
    <Suspense fallback={null}>
      <SessionGate variant="app">{children}</SessionGate>
    </Suspense>
  );
}
