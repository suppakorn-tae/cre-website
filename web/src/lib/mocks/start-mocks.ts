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
