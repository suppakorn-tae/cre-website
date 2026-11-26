'use client';

import { useEffect, type ReactNode } from 'react';

import { gateApiFetch, startMocks } from './start-mocks';

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

let fetchGated = false;

/** Holds api requests until the worker is up; installed once, in the browser only. */
function gateBrowserFetch() {
  if (fetchGated || typeof window === 'undefined') return;
  fetchGated = true;
  window.fetch = gateApiFetch(window.fetch.bind(window), startWorkerOnce, window.location.origin);
}

if (MOCKS_ENABLED) gateBrowserFetch();

/**
 * With NEXT_PUBLIC_API_MOCKS=1 starts the MSW service worker. Children render
 * straight away, also on the server, so Next can prerender the shell. Api
 * requests wait for the worker instead, so the first ones are already
 * intercepted. Otherwise a no-op.
 */
export function MockGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (MOCKS_ENABLED) void startWorkerOnce();
  }, []);

  return children;
}
