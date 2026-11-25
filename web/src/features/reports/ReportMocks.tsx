'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { registerVersionMocks } from '@/features/versions/VersionMocks';
import { MOCKS_ENABLED } from '@/lib/mocks/mock-gate';

/**
 * With NEXT_PUBLIC_API_MOCKS=1 adds the project and version handlers the page
 * reads before children render (job handlers are in the shared list).
 * Otherwise renders children directly.
 */
export function ReportMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        await registerVersionMocks();
      } catch (error) {
        console.error('report mocks failed to register; continuing without them', error);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
