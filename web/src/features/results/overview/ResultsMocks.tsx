'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { MOCKS_ENABLED } from '@/lib/mocks/mock-gate';

/** Adds the project, version and results handlers to the running worker. */
export async function registerResultMocks(): Promise<void> {
  const [{ worker }, { projectHandlers }, { resultHandlers }, { hvhHandlers }] = await Promise.all([
    import('@/mocks/browser'),
    import('@/features/projects/mocks'),
    import('./mocks'),
    import('../hvh/mocks'),
  ]);
  worker.use(...hvhHandlers, ...projectHandlers, ...resultHandlers);
}

/**
 * With NEXT_PUBLIC_API_MOCKS=1 registers the mock handlers before children
 * render. Otherwise renders children directly.
 */
export function ResultsMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        await registerResultMocks();
      } catch (error) {
        console.error('results mocks failed to register; continuing without them', error);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
