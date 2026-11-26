import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Toast } from '@/components/ui';

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

import { createJobHandlers } from '@/mocks/jobs';

import { downloadUrl, fetchJob, reportJobKey, requestReport } from './api';
import { backoffDelay, isFinished, pollInterval, type JobStatus } from './polling';
import { ReportButton } from './ReportButton';
import { READY_TOAST_MS, reportToast } from './reportToast';
import { buttonText, reportFileName, reportState, type ReportState } from './state';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const messages = { reports, ui };
const intl = (node: React.ReactNode) => (
  <NextIntlClientProvider locale="th" messages={messages}>
    {node}
  </NextIntlClientProvider>
);

describe('polling', () => {
  it('backs off by half each time up to ten seconds', () => {
    expect([0, 1, 2, 3].map(backoffDelay)).toEqual([1000, 1500, 2250, 3375]);
    expect(backoffDelay(20)).toBe(10_000);
  });

  it('stops on done, failed and expired only', () => {
    expect(pollInterval('queued', 0)).toBe(1000);
    expect(pollInterval('running', 2)).toBe(2250);
    expect(pollInterval(undefined, 0)).toBe(1000);
    for (const s of ['done', 'failed', 'expired'] as const) {
      expect(isFinished(s)).toBe(true);
      expect(pollInterval(s, 3)).toBe(false);
    }
  });
});

describe('report state', () => {
  const base = {
    requesting: false,
    requestFailed: false,
    jobId: null,
    jobStatus: undefined,
    pollFailed: false,
  } as const;

  it('is idle until a job exists', () => {
    expect(reportState(base)).toBe('idle');
  });

  it('is building while the request or the job is running', () => {
    expect(reportState({ ...base, requesting: true })).toBe('building');
    expect(reportState({ ...base, jobId: 'j' })).toBe('building');
    for (const jobStatus of ['queued', 'running'] as const) {
      expect(reportState({ ...base, jobId: 'j', jobStatus })).toBe('building');
    }
  });

  it('is ready when the job is done and failed for every other end', () => {
    expect(reportState({ ...base, jobId: 'j', jobStatus: 'done' })).toBe('ready');
    for (const jobStatus of ['failed', 'expired'] as const) {
      expect(reportState({ ...base, jobId: 'j', jobStatus })).toBe('failed');
    }
    expect(reportState({ ...base, requestFailed: true })).toBe('failed');
    expect(reportState({ ...base, jobId: 'j', pollFailed: true })).toBe('failed');
  });
});

describe('a report through the job mocks', () => {
  /** Request, then poll like the hook does, and map each answer to a state. */
  async function walk(projectId: string, versionId: string, polls: number) {
    const jobId = await requestReport(projectId, versionId);
    const states: ReportState[] = [];
    let status: JobStatus | undefined;
    for (let i = 0; i < polls; i += 1) {
      status = (await fetchJob(jobId)).status;
      states.push(
        reportState({
          requesting: false,
          requestFailed: false,
          jobId,
          jobStatus: status,
          pollFailed: false,
        }),
      );
    }
    return { jobId, states };
  }

  it('goes queued, running, done: building, building, ready', async () => {
    server.use(...createJobHandlers());
    const { jobId, states } = await walk('p1', 'v1', 3);
    expect(states).toEqual(['building', 'building', 'ready']);
    // The download link of the finished job serves the PDF as an attachment.
    const pdf = await fetch(`http://localhost${downloadUrl(jobId)}`);
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf');
    expect(pdf.headers.get('Content-Disposition')).toMatch(/^attachment;/);
  });

  it('ends failed, and a retry starts a new job that is ready', async () => {
    server.use(...createJobHandlers({ failFirst: true }));
    const first = await walk('p1', 'v1', 3);
    expect(first.states).toEqual(['building', 'building', 'failed']);
    const retry = await walk('p1', 'v1', 3);
    expect(retry.jobId).not.toBe(first.jobId);
    expect(retry.states).toEqual(['building', 'building', 'ready']);
  });

  it('shares one job between repeated requests for the same version', async () => {
    server.use(...createJobHandlers());
    const a = await requestReport('p1', 'v1');
    expect(await requestReport('p1', 'v1')).toBe(a);
  });

  it('rejects a refused request, which the hook shows as failed', async () => {
    server.use(
      http.post('*/api/v1/projects/:p/versions/:v/reports', () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'slow down' } },
          { status: 429 },
        ),
      ),
    );
    await expect(requestReport('p1', 'v1')).rejects.toMatchObject({ status: 429 });
  });
});

describe('file name and button text', () => {
  it('names the file CRE-{nickname}-v{no}.pdf', () => {
    expect(reportFileName('TK2', 3)).toBe('CRE-TK2-v3.pdf');
    expect(reportFileName('a/b c', 1)).toBe('CRE-a_b_c-v1.pdf');
    expect(reportFileName(undefined, undefined)).toBe('CRE-report.pdf');
  });

  it('changes the label in place and keeps it plain beside a toast', () => {
    expect(
      (['idle', 'building', 'ready', 'failed'] as const).map((s) => buttonText(s, false)),
    ).toEqual(['label', 'building', 'again', 'retry']);
    expect(
      (['idle', 'building', 'ready', 'failed'] as const).map((s) => buttonText(s, true)),
    ).toEqual(['label', 'building', 'label', 'label']);
  });
});

function ToastFor({ state, tooMany = false }: { state: ReportState; tooMany?: boolean }) {
  const t = useTranslations('reports.toast');
  const spec = reportToast(state, tooMany, t, { download: vi.fn(), retry: vi.fn() });
  if (!spec) return null;
  return (
    <Toast
      bare
      tone={spec.tone}
      icon={spec.icon}
      title={spec.title}
      description={spec.description}
      action={spec.action}
    />
  );
}
const toast = (state: ReportState, tooMany = false) =>
  renderToStaticMarkup(intl(<ToastFor state={state} tooMany={tooMany} />));

describe('report toast', () => {
  it('has none while idle', () => {
    expect(toast('idle')).toBe('');
  });

  it('shows a spinner, the title and the time estimate while building', () => {
    const html = toast('building');
    expect(html).toContain('กำลังสร้างรายงาน PDF…');
    expect(html).toContain('ใช้เวลาประมาณ 10–30 วินาที');
    expect(html).toContain('tabler-icon-loader-2');
    expect(html).not.toContain('ดาวน์โหลดอีกครั้ง');
  });

  it('says it is downloading and offers the download again when ready', () => {
    const html = toast('ready');
    expect(html).toContain('รายงานพร้อมแล้ว — กำลังดาวน์โหลด');
    expect(html).toContain('ดาวน์โหลดอีกครั้ง');
  });

  it('offers a retry when failed, and names too many requests', () => {
    const html = toast('failed');
    expect(html).toContain('สร้างรายงานไม่สำเร็จ');
    expect(html).toContain('ลองอีกครั้ง');
    expect(html).not.toContain('ขอรายงานบ่อยเกินไป');
    expect(toast('failed', true)).toContain('ขอรายงานบ่อยเกินไป');
  });

  it('closes by itself only once ready', () => {
    const t = (key: string) => key;
    const noop = { download: vi.fn(), retry: vi.fn() };
    const spec = (state: ReportState) => reportToast(state, false, t as never, noop);
    expect(spec('ready')?.duration).toBe(READY_TOAST_MS);
    expect(spec('building')?.duration).toBeUndefined();
    expect(spec('failed')?.duration).toBeUndefined();
  });
});

describe('ReportButton', () => {
  const render = (props: Partial<React.ComponentProps<typeof ReportButton>> = {}) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        {intl(<ReportButton projectId="p1" versionId="v1" submitted {...props} />)}
      </QueryClientProvider>,
    );

  it('is a button that does not link to a page', () => {
    const html = render();
    expect(html).toContain('รายงาน PDF');
    expect(html).toMatch(/<button[^>]*data-report="idle"/);
    expect(html).not.toContain('href=');
  });

  it('names the version for screen readers when it is in a list', () => {
    expect(render({ versionNo: 2 })).toContain('aria-label="รายงาน PDF เวอร์ชัน 2"');
  });

  it('has a hidden live region in place and none beside a toast', () => {
    expect(render()).toContain('aria-live="polite"');
    expect(render({ toast: true })).not.toContain('aria-live');
  });

  it('is disabled for a draft, with the reason', () => {
    const html = render({ submitted: false });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('data-report="draft"');
    expect(html).toContain('ส่งผลการประเมินก่อนจึงสร้างรายงานได้');
    expect(html).toContain('aria-describedby=');
  });
});

describe('job id cache key', () => {
  it('is kept per version', () => {
    expect(reportJobKey('p1', 'v1')).not.toEqual(reportJobKey('p1', 'v2'));
  });
});
