'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { MOCKS_ENABLED } from '@/lib/mocks/mock-gate';

/**
 * With NEXT_PUBLIC_API_MOCKS=1 adds the audit log mock handlers to the running
 * worker before children render. Otherwise renders children directly.
 */
export function AuditMocks({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ worker }, { auditHandlers }] = await Promise.all([
          import('@/mocks/browser'),
          import('./mocks'),
        ]);
        worker.use(...auditHandlers);
      } catch (error) {
        console.error('audit mocks failed to register; continuing without them', error);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
