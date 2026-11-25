'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { startMocks } from './start-mocks';

export const MOCKS_ENABLED = process.env.NEXT_PUBLIC_API_MOCKS === '1';

let workerStart: Promise<void> | undefined;

/** Starts the worker once per page load, even under React StrictMode. */
function startWorkerOnce(): Promise<void> {
  workerStart ??= startMocks(async () => {
    const { worker } = await import('@/mocks/browser');
    await worker.start({ onUnhandledFrame: 'bypass' });
  });
  return workerStart;
}

/**
 * With NEXT_PUBLIC_API_MOCKS=1 starts the MSW service worker before children
 * render, so the first requests are already intercepted. Otherwise a no-op.
 */
export function MockGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!MOCKS_ENABLED);

  useEffect(() => {
    if (!MOCKS_ENABLED) return;
    let cancelled = false;
    void startWorkerOnce().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
