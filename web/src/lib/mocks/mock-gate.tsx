'use client';

import { useEffect, useState, type ReactNode } from 'react';

export const MOCKS_ENABLED = process.env.NEXT_PUBLIC_API_MOCKS === '1';

/**
 * With NEXT_PUBLIC_API_MOCKS=1 starts the MSW service worker before children
 * render, so the first requests are already intercepted. Otherwise a no-op.
 */
export function MockGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    import('@/mocks/browser')
      .then(({ worker }) => worker.start({ onUnhandledFrame: 'bypass' }))
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
