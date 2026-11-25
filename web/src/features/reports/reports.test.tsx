import { readFileSync } from 'node:fs';

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

import { downloadUrl, fetchJob, inlineUrl, requestReport } from './api';
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
        finishedAt={status === 'done' ? '2026-11-14T10:02:00Z' : null}
        title="รายงาน TK2 · v3"
        downloadHref={downloadUrl('j1')}
        previewHref={inlineUrl('j1')}
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
    expect(html).toContain('พร้อมแล้ว');
    expect(html).toContain('href="/api/v1/reports/j1/download"');
  });

  it('offers a retry when failed', () => {
    const html = render('failed');
    expect(html).toContain('สร้างรายงานไม่สำเร็จ');
    expect(html).toContain('สร้างรายงานอีกครั้ง');
    expect(html).not.toContain('ดาวน์โหลด PDF');
  });
});

describe('ReportStatus layout', () => {
  it('lists every state and marks the current one', () => {
    const html = render('running');
    for (const text of [
      'อยู่ในคิว',
      'กรุณารอสักครู่',
      'กำลังสร้าง…',
      'ใช้เวลาประมาณ 10–30 วินาที',
      'ไม่สำเร็จ',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('เนื้อหาในรายงาน');
  });

  it('shows the ready card with a chip and a download button when done', () => {
    const html = render('done');
    expect(html).toContain('รายงาน TK2 · v3');
    expect(html).toContain('พร้อมแล้ว');
    expect(html).toContain('ดาวน์โหลด PDF');
  });

  it('frames the inline url and keeps the download button on the plain url', () => {
    const done = render('done');
    expect(done).toContain('ตัวอย่างหน้าแรกของ PDF');
    expect(done).toContain('<iframe');
    expect(done).toContain('src="/api/v1/reports/j1/download?disposition=inline"');
    expect(done).toContain('href="/api/v1/reports/j1/download" download');
    expect(done).not.toContain('href="/api/v1/reports/j1/download?disposition=inline"');
  });

  it('caps the frame height and keeps it A4 on wide screens', () => {
    const css = readFileSync(new URL('./reports.module.css', import.meta.url), 'utf8');
    const rule = /\.previewFrame\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('aspect-ratio: 210 / 297');
    expect(rule).toContain('max-height: 80vh');
    expect(rule).toContain('max-width: calc(80vh * 210 / 297)');
  });

  it('waits without a frame until the report is ready', () => {
    for (const s of ['queued', 'running', 'failed'] as const) {
      expect(render(s)).not.toContain('<iframe');
    }
    expect(render('queued')).toContain('ตัวอย่างจะแสดงเมื่อรายงานพร้อม');
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
