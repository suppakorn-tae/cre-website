'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { MOCKS_ENABLED } from '@/lib/mocks/mock-gate';

/**
 * With NEXT_PUBLIC_API_MOCKS=1 adds the dashboard mock handlers, the projects ones (for
 * the count and limit; the catalogue is already in the shared list) to the running worker before
 * children render. Otherwise renders children directly.
 */
export function DashboardMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ worker }, { dashboardHandlers }, { projectHandlers }] = await Promise.all([
          import('@/mocks/browser'),
          import('./mocks'),
          // The header asks the projects list for the project count and limit.
          import('@/features/projects/mocks'),
        ]);
        worker.use(...dashboardHandlers, ...projectHandlers);
      } catch (error) {
        console.error('dashboard mocks failed to register; continuing without them', error);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
