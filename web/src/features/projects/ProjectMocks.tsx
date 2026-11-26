'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { MOCKS_ENABLED } from '@/lib/mocks/mock-gate';

/**
 * With NEXT_PUBLIC_API_MOCKS=1 adds the projects mock handlers to the running
 * worker before children render. Otherwise renders children directly.
 */
export function ProjectMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ worker }, { projectHandlers }, { resultHandlers }, { createVersionHandlers }] =
          await Promise.all([
            import('@/mocks/browser'),
            import('./mocks'),
            import('@/features/results/overview/mocks'),
            import('@/features/versions/mocks'),
          ]);
        // The step indicator asks for the latest version of the project.
        worker.use(...projectHandlers, ...resultHandlers, ...createVersionHandlers());
      } catch (error) {
        console.error('project mocks failed to register; continuing without them', error);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
