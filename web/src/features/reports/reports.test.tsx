import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import reports from '../../../messages/th/reports.json';

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

import { downloadUrl, fetchJob, requestReport } from './api';
import { backoffDelay, isFinished, pollInterval } from './polling';
import { ReportStatus } from './ReportStatus';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const render = (status: Parameters<typeof ReportStatus>[0]['status']) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ reports }}>
      <ReportStatus
        status={status}
        downloadHref={downloadUrl('j1')}
        onRetry={vi.fn()}
        retrying={false}
      />
    </NextIntlClientProvider>,
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

describe('ReportStatus', () => {
  it('shows queue and progress text without a download', () => {
    expect(render('queued')).toContain('อยู่ในคิว');
    const running = render('running');
    expect(running).toContain('กำลังสร้าง…');
    expect(running).toContain('ออกจากหน้านี้ได้เลย');
    expect(running).not.toContain('ดาวน์โหลด PDF');
  });

  it('links to the download when done', () => {
    const html = render('done');
    expect(html).toContain('รายงานพร้อมดาวน์โหลด');
    expect(html).toContain('href="/api/v1/reports/j1/download"');
  });

  it('offers a retry when failed', () => {
    const html = render('failed');
    expect(html).toContain('สร้างรายงานไม่สำเร็จ');
    expect(html).toContain('สร้างรายงานอีกครั้ง');
    expect(html).not.toContain('ดาวน์โหลด PDF');
  });
});

describe('report api', () => {
  it('requests a report and reads the job through the mocks', async () => {
    server.use(...createJobHandlers());
    const id = await requestReport('p1', 'v1');
    expect(await requestReport('p1', 'v1')).toBe(id);
    expect((await fetchJob(id)).status).toBe('queued');
    expect((await fetchJob(id)).status).toBe('running');
    expect((await fetchJob(id)).status).toBe('done');
  });
});
