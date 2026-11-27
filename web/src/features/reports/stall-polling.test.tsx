// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchJob: vi.fn() }));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  fetchJob: api.fetchJob,
}));

import { reportJobKey } from './api';
import { QUEUED_STALL_MS } from './polling';
import { useReportDownload } from './useReportDownload';

const P = 'p1';
const V = 'v1';
const MIN = 60_000;
const START = Date.parse('2026-11-27T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  // A job that the worker never picks up.
  api.fetchJob.mockImplementation(async () => ({
    id: 'j1',
    status: 'queued',
    created_at: new Date(START).toISOString(),
    started_at: null,
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  api.fetchJob.mockReset();
});

describe('a job stuck in the queue', () => {
  it('sends no request once it is reported as stalled', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(reportJobKey(P, V), 'j1');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useReportDownload(P, V), { wrapper });

    // Step in small slices until the hook reports the stall.
    for (let i = 0; i < 300 && !result.current.stalled; i += 1) {
      await act(() => vi.advanceTimersByTimeAsync(1000));
    }
    expect(result.current.stalled).toBe(true);
    expect(Date.now() - START).toBeGreaterThanOrEqual(QUEUED_STALL_MS);

    const before = api.fetchJob.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(10 * MIN));
    expect(api.fetchJob.mock.calls.length).toBe(before);
  });

  // The results page has two views of one job: its report button and step 5 of the step bar.
  it('stalls in every view at once when the first answer comes late', async () => {
    // The first answer takes 3 minutes (a slow network, or a tab put to sleep).
    api.fetchJob.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: 'j1',
                status: 'queued',
                created_at: new Date(START).toISOString(),
                started_at: null,
              }),
            3 * MIN,
          );
        }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(reportJobKey(P, V), 'j1');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({ button: useReportDownload(P, V), steps: useReportDownload(P, V) }),
      { wrapper },
    );

    // The 2 minutes count from that first answer, so neither view stalls on it.
    await act(() => vi.advanceTimersByTimeAsync(3 * MIN));
    expect(api.fetchJob).toHaveBeenCalledTimes(1);
    expect(result.current.button.stalled).toBe(false);
    expect(result.current.steps.stalled).toBe(false);

    for (let i = 0; i < 300 && !result.current.button.stalled; i += 1) {
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(result.current.steps.stalled).toBe(result.current.button.stalled);
    }
    expect(result.current.button.stalled).toBe(true);
    expect(result.current.steps.stalled).toBe(true);

    // Neither view polls once the stall is shown.
    const before = api.fetchJob.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(10 * MIN));
    expect(api.fetchJob.mock.calls.length).toBe(before);

    // "Check again" from one view resumes the wait for both.
    act(() => result.current.steps.start());
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(api.fetchJob.mock.calls.length).toBeGreaterThan(before);
    expect(result.current.button.stalled).toBe(false);
    expect(result.current.steps.stalled).toBe(false);
  });
});
