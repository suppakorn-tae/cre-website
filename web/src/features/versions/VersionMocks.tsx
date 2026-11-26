'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { MOCKS_ENABLED } from '@/lib/mocks/mock-gate';

/**
 * Adds project, version and compare handlers to the running worker. Project
 * handlers too: a direct load or reload of the detail page never passes
 * through the projects list that registers them. The versions tab draws the
 * comparison, so it needs the compare handlers.
 */
export async function registerVersionMocks(): Promise<void> {
  const [{ worker }, { projectHandlers }, { createVersionHandlers }, { createCompareHandlers }] =
    await Promise.all([
      import('@/mocks/browser'),
      import('@/features/projects/mocks'),
      import('./mocks'),
      import('@/features/compare/mocks'),
    ]);
  worker.use(...projectHandlers, ...createVersionHandlers(), ...createCompareHandlers());
}

/**
 * With NEXT_PUBLIC_API_MOCKS=1 adds the project and version mock handlers to the running
 * worker before children render. Otherwise renders children directly.
 */
export function VersionMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        await registerVersionMocks();
      } catch (error) {
        console.error('version mocks failed to register; continuing without them', error);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
