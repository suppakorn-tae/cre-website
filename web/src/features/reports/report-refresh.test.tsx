// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import reports from '../../../messages/th/reports.json';
import shell from '../../../messages/th/shell.json';
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

import { projectKey } from '@/features/versions/api';
import { ProjectSteps } from '@/features/shell/ProjectSteps';
import { invalidateAfterSubmit } from '@/features/shell/useStepState';

import { jobKey, reportJobKey, resultsKey, versionKey } from './api';
import { ReportButton } from './ReportButton';
import { inputsChangedSince, reportState } from './state';
import { useReportDownload } from './useReportDownload';

const P = 'p1';
const V = 'v1';
const BASE = '*/api/v1';
const T0 = '2026-11-27T10:00:00.000Z';
const BEFORE = '2026-11-27T09:59:00.000Z';
const AFTER = '2026-11-27T10:01:00.000Z';
/** When the server makes a new job: after the change that asked for it. */
const NEW_JOB = '2026-11-27T10:02:00.000Z';

const server = setupServer();
const requests: string[] = [];
const count = (what: string) => requests.filter((r) => r === what).length;
const reportsPost = `POST /api/v1/projects/${P}/versions/${V}/reports`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** The links the hook clicked to save the file. */
const clicks: (string | null)[] = [];

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  requests.length = 0;
  clicks.length = 0;
  server.events.on('request:start', ({ request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.getAttribute('href'));
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const job = (id: string, status: string, created = T0) => ({
  id,
  kind: 'report',
  status,
  created_at: created,
  started_at: null,
  finished_at: null,
  expires_at: null,
  error: null,
});

/** A client that already holds job `j1`, done, as after a first download. */
function clientWithDoneJob() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false } },
  });
  client.setQueryData(projectKey(P), { nickname: 'TK2', updated_at: BEFORE });
  client.setQueryData(versionKey(P, V), { version_no: 3, submitted_at: BEFORE });
  client.setQueryData(reportJobKey(P, V), 'j1');
  client.setQueryData(jobKey('j1'), job('j1', 'done'));
  return client;
}
const wrapperFor = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

/** The server answers `ids` in turn, then the last one; each new job walks queued, running, done. */
function serverAnswers(ids: string[]) {
  let asked = 0;
  const polls = new Map<string, number>();
  server.use(
    http.post(`${BASE}/projects/:p/versions/:v/reports`, () => {
      const id = ids[Math.min(asked, ids.length - 1)]!;
      asked += 1;
      return HttpResponse.json({ job_id: id }, { status: 202 });
    }),
    http.get(`${BASE}/jobs/:id`, ({ params }) => {
      const id = String(params.id);
      const n = polls.get(id) ?? 0;
      polls.set(id, n + 1);
      if (id === 'j1') return HttpResponse.json(job(id, 'done'));
      return HttpResponse.json(job(id, ['queued', 'running', 'done'][Math.min(n, 2)]!, NEW_JOB));
    }),
  );
}

describe('a click on a report that is ready', () => {
  it('asks the server; the same job is saved at once, on every click', async () => {
    serverAnswers(['j1']);
    const { result } = renderHook(() => useReportDownload(P, V), {
      wrapper: wrapperFor(clientWithDoneJob()),
    });
    expect(result.current.state).toBe('ready');

    act(() => result.current.start());
    await waitFor(() => expect(clicks).toEqual(['/api/v1/reports/j1/download']));
    expect(count(reportsPost)).toBe(1);

    // The "once per job" guard does not swallow a click.
    act(() => result.current.start());
    await waitFor(() => expect(clicks).toHaveLength(2));
    expect(count(reportsPost)).toBe(2);
    await sleep(100);
    expect(clicks).toHaveLength(2);
    expect(result.current.jobId).toBe('j1');
    expect(result.current.state).toBe('ready');
  });

  it('polls a new job and saves it once when it is done', async () => {
    serverAnswers(['j2']);
    const { result } = renderHook(() => useReportDownload(P, V), {
      wrapper: wrapperFor(clientWithDoneJob()),
    });
    act(() => result.current.start());
    await waitFor(() => expect(result.current.jobId).toBe('j2'));
    // No check for 'building' here: on a fast runner the polls finish before
    // the next render. The poll count below proves the new job was polled.
    await waitFor(() => expect(result.current.state).toBe('ready'), { timeout: 3000 });
    await sleep(100);
    expect(clicks).toEqual(['/api/v1/reports/j2/download']);
    expect(count(`GET /api/v1/jobs/j2`)).toBe(3);
    expect(count(reportsPost)).toBe(1);
  });
});

describe('a cached report after the version changed', () => {
  it.each([
    ['a new submission', versionKey(P, V), { version_no: 3, submitted_at: AFTER }],
    [
      'a strategy save',
      resultsKey(P, V),
      { submitted_at: BEFORE, items: [{ strategy_updated_at: AFTER }] },
    ],
    ['a project edit', projectKey(P), { nickname: 'TK2', updated_at: AFTER }],
  ])('is not shown as ready after %s, and a click builds a new one', async (_, key, data) => {
    serverAnswers(['j2']);
    const client = clientWithDoneJob();
    const { result } = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    expect(result.current.state).toBe('ready');

    act(() => client.setQueryData(key, data));
    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(result.current.jobId).toBe('j1');

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state).toBe('ready'), { timeout: 3000 });
    expect(result.current.jobId).toBe('j2');
    await waitFor(() => expect(clicks).toEqual(['/api/v1/reports/j2/download']));
  });

  it('stays ready when the changes are older than the job', () => {
    const client = clientWithDoneJob();
    client.setQueryData(resultsKey(P, V), {
      submitted_at: BEFORE,
      items: [{ strategy_updated_at: BEFORE }, {}],
    });
    const { result } = renderHook(() => useReportDownload(P, V), { wrapper: wrapperFor(client) });
    expect(result.current.state).toBe('ready');
  });
});

describe('the report button and step 5 after a submit', () => {
  it('go back to the plain label', async () => {
    let submittedAt = BEFORE;
    const version = () => ({
      id: V,
      project_id: P,
      version_no: 3,
      status: 'submitted',
      editable: true,
      submitted_at: submittedAt,
    });
    server.use(
      http.get(`${BASE}/projects/:p/versions`, () => HttpResponse.json({ items: [version()] })),
      http.get(`${BASE}/projects/:p/versions/:v`, () => HttpResponse.json(version())),
      http.get(`${BASE}/projects/:p/versions/:v/results`, () =>
        HttpResponse.json({ submitted_at: submittedAt, items: [] }),
      ),
    );
    const client = clientWithDoneJob();
    client.removeQueries({ queryKey: versionKey(P, V), exact: true });
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="th" messages={{ reports, shell, ui }}>
          <ProjectSteps current="results" projectId={P} versionId={V} />
          <ReportButton projectId={P} versionId={V} submitted />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    const nav = screen.getByRole('navigation', { name: shell.steps.label });
    await waitFor(() => expect(within(nav).getByText(shell.steps.reportState.ready)).toBeTruthy());
    expect(screen.getByRole('button', { name: reports.action.again })).toBeTruthy();

    // The assessment page submits again and invalidates the version.
    submittedAt = AFTER;
    act(() => invalidateAfterSubmit(client, P));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: reports.action.label })).toBeTruthy(),
    );
    expect(within(nav).queryByText(shell.steps.reportState.ready)).toBeNull();
    expect(within(nav).getByText(shell.steps.reportState.idle)).toBeTruthy();
    expect(clicks).toHaveLength(0);
  });
});

describe('inputsChangedSince', () => {
  it('counts a change at or after the job, like the server', () => {
    expect(inputsChangedSince(T0, [BEFORE, null, undefined])).toBe(false);
    expect(inputsChangedSince(T0, [BEFORE, T0])).toBe(true);
    expect(inputsChangedSince(T0, [AFTER])).toBe(true);
  });
  it('knows nothing without the job time or with unknown times', () => {
    expect(inputsChangedSince(undefined, [AFTER])).toBe(false);
    expect(inputsChangedSince(T0, ['not a time', ''])).toBe(false);
  });
  it('turns a finished job back into the plain label, not one being built', () => {
    const base = { requesting: false, requestFailed: false, jobId: 'j1', pollFailed: false };
    expect(reportState({ ...base, jobStatus: 'done', outdated: true })).toBe('idle');
    expect(reportState({ ...base, jobStatus: 'failed', outdated: true })).toBe('idle');
    expect(reportState({ ...base, jobStatus: 'running', outdated: true })).toBe('building');
    expect(reportState({ ...base, jobStatus: 'done', outdated: false })).toBe('ready');
  });
});
