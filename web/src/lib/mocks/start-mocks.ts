/**
 * Runs the mock worker start-up and always resolves, so the app renders even
 * when the worker cannot start (e.g. mockServiceWorker.js is missing).
 */
export async function startMocks(start: () => Promise<unknown>): Promise<void> {
  try {
    await start();
  } catch (error) {
    console.error('API mocks failed to start; continuing without them', error);
  }
}

/** Same-origin api calls (`/api/...`), which the worker answers in mock mode. */
export function isApiRequest(input: RequestInfo | URL, origin: string): boolean {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(raw, origin).pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/**
 * Wraps `fetch` so api calls wait for `ready` before they leave the page. That
 * lets the app render (and prerender) normally while the worker starts, with no
 * request reaching the network before the worker can answer it.
 */
export function gateApiFetch(
  base: typeof fetch,
  ready: () => Promise<unknown>,
  origin: string,
): typeof fetch {
  return async (input, init) => {
    if (isApiRequest(input, origin)) await ready();
    return base(input, init);
  };
}
