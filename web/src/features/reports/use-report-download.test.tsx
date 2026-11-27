// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, renderHook, render, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import reports from '../../../messages/th/reports.json';
import ui from '../../../messages/th/ui.json';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client')>();
  const client = original.createApiClient({
    baseUrl: 'http://localhost/api/v1',
    // Resolve fetch per call: MSW patches it after this module loads.
    fetch: (input) => globalThis.fetch(input),
  });
  return { ...original, browserApi: () => client };
});

// The same back-off rules, but quick, so a build takes milliseconds.
vi.mock('./polling', async (importOriginal) => {
  const original = await importOriginal<typeof import('./polling')>();
  return {
    ...original,
    pollInterval: (job: Parameters<typeof original.pollInterval>[0]) =>
      original.isFinished(job?.status) ? false : 15,
  };
});

const toaster = vi.hoisted(() => ({ show: vi.fn(), dismiss: vi.fn() }));
vi.mock('@/components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui')>()),
  useToaster: () => toaster,
}));

import { createJobHandlers } from '@/mocks/jobs';

import { jobKey, reportJobKey, versionKey } from './api';
import { ReportButton } from './ReportButton';
import { useReportDownload } from './useReportDownload';
import { projectKey } from '@/features/versions/api';

const P = 'p1';
const V = 'v1';
const URL_BASE = '*/api/v1';

const server = setupServer();
const requests: string[] = [];
const count = (what: string) => requests.filter((r) => r === what).length;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The links the hook clicked to save the file. */
const clicks: { href: string | null; download: string }[] = [];

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  requests.length = 0;
  clicks.length = 0;
  toaster.show.mockClear();
  toaster.dismiss.mockClear();
  server.events.on('request:start', ({ request }) => {
    // Status polls of any job count as one kind of request.
    const path = new URL(request.url).pathname.replace(/\/jobs\/[^/]+$/, '/jobs');
    requests.push(`${request.method} ${path}`);
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.getAttribute('href'), download: this.download });
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } },
  });
  // The names for the file; the hook would fetch them otherwise.
  client.setQueryData(projectKey(P), { nickname: 'TK2' });
  client.setQueryData(versionKey(P, V), { version_no: 3 });
  return client;
}
function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const job = (id: string, status: string) => ({
  id,
  kind: 'report',
  status,
  created_at: '2026-11-26T00:00:00Z',
  started_at: null,
  finished_at: null,
  expires_at: null,
  error: status === 'failed' ? 'boom' : null,
});
const jobsGet = 'GET /api/v1/jobs';
const reportsPost = `POST /api/v1/projects/${P}/versions/${V}/reports`;

/** One job id `j1` whose status comes from the list, then stays on the last one. */
function scripted(statuses: (string | 500)[]) {
  let polls = 0;
  server.use(
    http.post(`${URL_BASE}/projects/:p/versions/:v/reports`, () =>
      HttpResponse.json({ job_id: 'j1' }, { status: 202 }),
    ),
    http.get(`${URL_BASE}/jobs/:id`, ({ params }) => {
      const next = statuses[Math.min(polls, statuses.length - 1)];
      polls += 1;
      return next === 500
        ? HttpResponse.json({ error: { code: 'internal', message: 'x' } }, { status: 500 })
        : HttpResponse.json(job(String(params.id), next));
    }),
  );
}

const ready = (result: { current: { state: string } }) =>
  waitFor(() => expect(result.current.state).toBe('ready'), { timeout: 3000 });

describe('useReportDownload', () => {
  it('polls until done, downloads, and stops polling', async () => {
    server.use(...createJobHandlers());
    const { result } = renderHook(() => useReportDownload(P, V), {
      wrapper: wrapperFor(makeClient()),
    });
    expect(result.current.state).toBe('idle');
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toBe('building'));
    await ready(result);
    await waitFor(() => expect(clicks).toHaveLength(1));

    const polls = count(jobsGet);
    expect(polls).toBe(3); // queued, running, done
    await sleep(120);
    expect(count(jobsGet)).toBe(polls);
  });

  it('stops polling when the component goes away', async () => {
    scripted(['running']);
    const { result, unmount } = renderHook(() => useReportDownload(P, V), {
      wrapper: wrapperFor(makeClient()),
    });
    act(() => result.current.start());
    await waitFor(() => expect(count(jobsGet)).toBeGreaterThanOrEqual(2));
    unmount();
    await sleep(40);
    const polls = count(jobsGet);
    await sleep(120);
    expect(count(jobsGet)).toBe(polls);
    expect(clicks).toHaveLength(0);
  });

  it('starts one job however often it is clicked', async () => {
    server.use(...createJobHandlers());
    const { result } = renderHook(() => useReportDownload(P, V), {
      wrapper: wrapperFor(makeClient()),
    });
    act(() => {
      result.current.start();
      result.current.start();
      result.current.start();
    });
    await ready(result);
    expect(count(reportsPost)).toBe(1);
    await waitFor(() => expect(clicks).toHaveLength(1));
    // Ready: the click asks again, gets the same job and saves its file again.
    act(() => result.current.start());
    await waitFor(() => expect(clicks).toHaveLength(2));
    expect(count(reportsPost)).toBe(2);
  });

  it('downloads once per job, named after the project and version', async () => {
    server.use(...createJobHandlers());
    const { result } = renderHook(() => useReportDownload(P, V), {
      wrapper: wrapperFor(makeClient()),
    });
    act(() => result.current.start());
    await ready(result);
    await sleep(100);
    expect(clicks).toEqual([
      { href: `/api/v1/reports/${result.current.jobId}/download`, download: 'CRE-TK2-v3.pdf' },
    ]);
    // Only a click on "ดาวน์โหลดอีกครั้ง" saves it again.
    await act(() => result.current.download());
    expect(clicks).toHaveLength(2);
  });

  it('does not download again when the page opens on a job it already knows', async () => {
    scripted(['done']);
    const client = makeClient();
    client.setQueryData(reportJobKey(P, V), 'j1');

    // The id is cached, the job data is not (it was garbage-collected).
    const first = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    await ready(first.result);
    await sleep(100);
    expect(clicks).toHaveLength(0);
    first.unmount();

    // Old data that said "running" while the job has long finished.
    client.setQueryData(jobKey('j1'), job('j1', 'running'), { updatedAt: Date.now() - 600_000 });
    const stale = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    await ready(stale.result);
    await sleep(100);
    expect(clicks).toHaveLength(0);
    stale.unmount();

    // Done data in the cache.
    client.setQueryData(jobKey('j1'), job('j1', 'done'));
    const done = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    expect(done.result.current.state).toBe('ready');
    await sleep(100);
    expect(clicks).toHaveLength(0);
  });

  it('does not download again after a remount, with or without the job data', async () => {
    server.use(...createJobHandlers());
    const client = makeClient();
    const first = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    act(() => first.result.current.start());
    await ready(first.result);
    await waitFor(() => expect(clicks).toHaveLength(1));
    const id = first.result.current.jobId!;
    first.unmount();

    const again = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    await ready(again.result);
    again.unmount();

    client.removeQueries({ queryKey: jobKey(id) });
    const collected = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    await ready(collected.result);
    await sleep(100);
    expect(clicks).toHaveLength(1);
  });

  it('downloads once when the page opens on a job that is still being built', async () => {
    scripted(['running', 'running', 'done']);
    const client = makeClient();
    client.setQueryData(reportJobKey(P, V), 'j1');
    const { result } = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    await ready(result);
    await waitFor(() => expect(clicks).toHaveLength(1));
    await sleep(100);
    expect(clicks).toHaveLength(1);
  });

  it('retry after a failure starts a new job', async () => {
    server.use(...createJobHandlers({ failFirst: true }));
    const { result } = renderHook(() => useReportDownload(P, V), {
      wrapper: wrapperFor(makeClient()),
    });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toBe('failed'), { timeout: 3000 });
    const first = result.current.jobId;
    expect(clicks).toHaveLength(0);
    expect(count(reportsPost)).toBe(1);

    act(() => result.current.retry());
    await ready(result);
    expect(count(reportsPost)).toBe(2);
    expect(result.current.jobId).not.toBe(first);
    await sleep(100);
    expect(clicks).toEqual([
      { href: `/api/v1/reports/${result.current.jobId}/download`, download: 'CRE-TK2-v3.pdf' },
    ]);
  });

  it('two components for one version download once', async () => {
    server.use(...createJobHandlers());
    const { result } = renderHook(
      () => [useReportDownload(P, V), useReportDownload(P, V)] as const,
      { wrapper: wrapperFor(makeClient()) },
    );
    act(() => result.current[0].start());
    await waitFor(() => {
      expect(result.current[0].state).toBe('ready');
      expect(result.current[1].state).toBe('ready');
    });
    await sleep(100);
    expect(clicks).toHaveLength(1);
    expect(count(reportsPost)).toBe(1);
  });

  it('stops polling when a status request fails, and a retry downloads the report', async () => {
    scripted(['running', 500, 'done']);
    const { result } = renderHook(() => useReportDownload(P, V), {
      wrapper: wrapperFor(makeClient()),
    });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toBe('failed'), { timeout: 3000 });
    // No more polls, so a later "done" cannot slip in without a click.
    const polls = count(jobsGet);
    await sleep(120);
    expect(count(jobsGet)).toBe(polls);
    expect(clicks).toHaveLength(0);

    act(() => result.current.retry());
    await ready(result);
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(count(reportsPost)).toBe(2);
  });
});

describe('ReportButton with two buttons for one version', () => {
  const buttons = (client: QueryClient, toast: [boolean, boolean]) =>
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="th" messages={{ reports, ui }}>
          <ReportButton projectId={P} versionId={V} submitted toast={toast[0]} />
          <ReportButton projectId={P} versionId={V} submitted toast={toast[1]} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  const shown = (id: string) => toaster.show.mock.calls.filter(([t]) => t.id === id).length;

  it('shows the toasts from the button that asks for them only, and downloads once', async () => {
    server.use(...createJobHandlers());
    const view = buttons(makeClient(), [true, false]);
    fireEvent.click(view.getAllByRole('button', { name: 'รายงาน PDF' })[0]);

    await waitFor(() => expect(shown('report-ready')).toBe(1), { timeout: 3000 });
    await sleep(100);
    expect(shown('report-building')).toBe(1);
    expect(shown('report-ready')).toBe(1);
    expect(clicks).toHaveLength(1);
  });

  it('shows no toast from buttons that did not ask for one', async () => {
    server.use(...createJobHandlers());
    const view = buttons(makeClient(), [false, false]);
    fireEvent.click(view.getAllByRole('button', { name: 'รายงาน PDF' })[0]);
    await waitFor(() => expect(clicks).toHaveLength(1), { timeout: 3000 });
    expect(toaster.show).not.toHaveBeenCalled();
    // The in-place label and the hidden live region speak instead.
    expect(view.getAllByRole('button', { name: 'ดาวน์โหลดอีกครั้ง' })).toHaveLength(2);
  });
});
