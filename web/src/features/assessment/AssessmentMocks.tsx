'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { MOCKS_ENABLED } from '@/lib/mocks/mock-gate';

/**
 * With NEXT_PUBLIC_API_MOCKS=1 adds the answer mock handlers to the running
 * worker before children render (the catalogue handler is already shared).
 * Otherwise renders children directly.
 */
export function AssessmentMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ worker }, { createAnswerHandlers }, { resultHandlers }] = await Promise.all([
          import('@/mocks/browser'),
          import('./mocks'),
          import('@/features/results/overview/mocks'),
        ]);
        // The step indicator asks for the version and its results too.
        worker.use(...createAnswerHandlers(), ...resultHandlers);
      } catch (error) {
        console.error('assessment mocks failed to register; continuing without them', error);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
