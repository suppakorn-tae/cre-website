import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/errors';

import exportMessages from '../../../../messages/th/admin-export.json';
import ui from '../../../../messages/th/ui.json';

import { buildRequest, isFinal, pollInterval, type Job } from './api';
import { ExportPage } from './ExportPage';
import { ExportRow } from './ExportRow';
import { ZipTree, ZIP_TREE } from './ZipTree';
import { exportHandlers, jobAt, resetExportMocks } from './mocks';

const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ 'admin-export': exportMessages, ui }}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );

describe('ExportPage', () => {
  it('shows the scope choice, deleted option, pseudonymisation note and empty history', () => {
    const html = wrap(<ExportPage />);
    for (const text of [
      'ส่งออกข้อมูลวิจัย',
      'ผู้ใช้ทั้งหมด',
      'เลือกผู้ใช้',
      'รวมโครงการและเวอร์ชันที่ผู้ใช้ลบแล้ว',
      'ขอส่งออกข้อมูล',
      'ไม่มีอีเมลหรือบัญชี Google',
      'ไฟล์ดาวน์โหลดได้ภายใน 7 วันหลังสร้างเสร็จ',
      'คำขอส่งออกล่าสุด',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('renders a request row while its status is still loading', () => {
    const html = wrap(
      <ExportRow
        entry={{
          id: 'job-1',
          requestedAt: '2026-11-15T03:02:00Z',
          request: { scope: 'selected', user_ids: ['a', 'b'], include_deleted: true },
        }}
        onAgain={() => {}}
      />,
    );
    expect(html).toContain('เลือก 2 ผู้ใช้');
    expect(html).toContain('ใช่');
  });
});

describe('ZipTree', () => {
  it('lists the zip, user, project and version entries in order with nesting', () => {
    expect(ZIP_TREE.map((e) => [e.key, e.depth])).toEqual([
      ['zip', 0],
      ['user', 1],
      ['userFile', 2],
      ['project', 2],
      ['projectFile', 3],
      ['version', 3],
    ]);
    const html = wrap(<ZipTree />);
    let at = -1;
    for (const name of ['cre-export.zip', 'user.json', 'project.json', 'v1-v3.csv']) {
      const next = html.indexOf(name);
      expect(next).toBeGreaterThan(at);
      at = next;
    }
    expect(html).toContain('data-depth="3"');
    expect(html).toContain('1 แถวต่อตัวชี้วัด');
  });
});

describe('request and polling rules', () => {
  it('sends user_ids only for the selected scope', () => {
    expect(buildRequest('all', ['a'], false)).toEqual({ scope: 'all', include_deleted: false });
    expect(buildRequest('selected', ['a'], true)).toEqual({
      scope: 'selected',
      user_ids: ['a'],
      include_deleted: true,
    });
  });

  it('polls until the job is done, failed or expired', () => {
    const job = (status: Job['status']) => ({ status }) as Job;
    expect(pollInterval(undefined)).toBe(2000);
    expect(pollInterval(job('queued'))).toBe(2000);
    expect(pollInterval(job('running'))).toBe(2000);
    for (const status of ['done', 'failed', 'expired'] as const) {
      expect(isFinal(status)).toBe(true);
      expect(pollInterval(job(status))).toBe(false);
    }
  });
});

describe('mock export api', () => {
  const server = setupServer(...exportHandlers);
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterAll(() => server.close());
  beforeEach(() => resetExportMocks());

  const base = 'http://localhost/api/v1';
  const post = (body: unknown) =>
    fetch(`${base}/admin/exports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const poll = async (id: string) => (await (await fetch(`${base}/jobs/${id}`)).json()) as Job;

  it('moves a job from queued to running to done and serves the zip', async () => {
    const accepted = await post({ scope: 'all', include_deleted: false });
    expect(accepted.status).toBe(202);
    const { job_id: id } = (await accepted.json()) as { job_id: string };
    expect((await poll(id)).status).toBe('queued');
    expect((await poll(id)).status).toBe('running');
    expect((await fetch(`${base}/admin/exports/${id}/download`)).status).toBe(409);
    const done = await poll(id);
    expect(done.status).toBe('done');
    expect(done.expires_at).not.toBeNull();
    const file = await fetch(`${base}/admin/exports/${id}/download`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/zip');
  });

  it('answers 410 for an expired export and reports the job as expired', async () => {
    const accepted = await post({ scope: 'all', include_deleted: true });
    const { job_id: id } = (await accepted.json()) as { job_id: string };
    for (let i = 0; i < 3; i += 1) await poll(id);
    const gone = await fetch(`${base}/admin/exports/${id}/download`);
    expect(gone.status).toBe(410);
    expect(ApiError.fromBody(410, await gone.json()).code).toBe('gone');
    expect((await poll(id)).status).toBe('expired');
  });

  it('rejects a selected scope without users and unknown jobs', async () => {
    expect((await post({ scope: 'selected', include_deleted: false })).status).toBe(422);
    expect((await fetch(`${base}/jobs/none`)).status).toBe(404);
  });

  it('searches users by e-mail or organisation', async () => {
    const res = await fetch(`${base}/admin/users?q=user07&page=1&page_size=20`);
    const body = (await res.json()) as { items: { email: string }[] };
    expect(body.items.map((u) => u.email)).toEqual(['user07@example.co.th']);
  });

  it('builds job states from the poll count', () => {
    const request = { scope: 'all', include_deleted: false } as const;
    expect(jobAt('x', { request, createdAt: 0, polls: 1 }).status).toBe('queued');
    expect(jobAt('x', { request, createdAt: 0, polls: 9 }).status).toBe('done');
  });
});
