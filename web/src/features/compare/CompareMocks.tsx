'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { MOCKS_ENABLED } from '@/lib/mocks/mock-gate';

/** Adds project and compare handlers to the running worker (direct loads skip the list). */
export async function registerCompareMocks(): Promise<void> {
  const [{ worker }, { projectHandlers }, { createCompareHandlers }] = await Promise.all([
    import('@/mocks/browser'),
    import('@/features/projects/mocks'),
    import('./mocks'),
  ]);
  worker.use(...projectHandlers, ...createCompareHandlers());
}

/** With NEXT_PUBLIC_API_MOCKS=1 registers the compare handlers before children render. */
export function CompareMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        await registerCompareMocks();
      } catch (error) {
        console.error('compare mocks failed to register; continuing without them', error);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
