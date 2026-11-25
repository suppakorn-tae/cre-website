import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import type { paths } from '@/lib/api/generated/schema';

import type { AdminUser, ExportRequest, Job } from './api';

// Feature-local mock of the export api. The shared handler list is not ours
// to edit, so `ExportMocks` adds these to the running worker instead.
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

const DAY_MS = 86_400_000;
const errorBody = (code: string, message: string) => ({ error: { code, message } });
const idFor = (prefix: string, n: number) =>
  `0193b7d0-${prefix}-7c3a-9d4f-${String(n).padStart(12, '0')}`;

const organisations = ['บริษัท ไอส์แลนด์เวิร์คส์ จำกัด', 'สำนักงานที่ปรึกษาทะเล', null];
export const mockUsers: AdminUser[] = Array.from({ length: 25 }, (_, i) => ({
  id: idFor('0001', i + 1),
  email: `user${String(i + 1).padStart(2, '0')}@example.co.th`,
  sign_in_methods: ['password'],
  organisation: organisations[i % 3],
  role: 'user',
  status: 'active',
  project_count: i % 4,
  version_count: (i * 3) % 7,
  created_at: '2026-10-01T03:00:00Z',
  updated_at: '2026-11-01T03:00:00Z',
}));

type MockJob = { request: ExportRequest; createdAt: number; polls: number };
let jobs = new Map<string, MockJob>();
let nextJob = 1;

/** Forgets every job. Used by tests. */
export function resetExportMocks(): void {
  jobs = new Map();
  nextJob = 1;
}

/**
 * Status on the n-th poll: queued, running, then done. A request that includes
 * deleted data models a lapsed file: it is done on the third poll, but its
 * download answers 410 and later polls report `expired`.
 */
export function jobAt(id: string, job: MockJob): Job {
  const created = new Date(job.createdAt).toISOString();
  const base = { id, kind: 'export' as const, created_at: created, error: null };
  if (job.polls <= 1) {
    return { ...base, status: 'queued', started_at: null, finished_at: null, expires_at: null };
  }
  if (job.polls === 2) {
    return { ...base, status: 'running', started_at: created, finished_at: null, expires_at: null };
  }
  const finished = new Date(job.createdAt + 5000).toISOString();
  const expires = new Date(job.createdAt + 5000 + 7 * DAY_MS).toISOString();
  const lapsed = job.request.include_deleted && job.polls > 3;
  return {
    ...base,
    status: lapsed ? 'expired' : 'done',
    started_at: created,
    finished_at: finished,
    expires_at: expires,
  };
}

export const exportHandlers: HttpHandler[] = [
  http.get('/admin/users', ({ request, response }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const found = mockUsers.filter((u) =>
      `${u.email} ${u.organisation ?? ''}`.toLowerCase().includes(q),
    );
    const pageSize = Number(url.searchParams.get('page_size') ?? 20);
    return response(200).json({
      items: found.slice(0, pageSize),
      meta: { page: 1, page_size: pageSize, total: found.length },
    });
  }),
  http.post('/admin/exports', async ({ request, response }) => {
    const body = (await request.clone().json()) as ExportRequest;
    if (body.scope === 'selected' && !body.user_ids?.length) {
      const { error } = errorBody('validation_failed', 'user_ids required');
      return response(422).json({
        error: { ...error, fields: [{ field: 'user_ids', code: 'required' }] },
      });
    }
    const id = idFor('0002', nextJob++);
    jobs.set(id, { request: body, createdAt: Date.now(), polls: 0 });
    return response(202).json({ job_id: id });
  }),
  http.get('/jobs/{id}', ({ params, response }) => {
    const job = jobs.get(params.id);
    if (!job) return response(404).json(errorBody('not_found', 'job not found'));
    job.polls += 1;
    return response(200).json(jobAt(params.id, job));
  }),
  mswHttp.get('*/api/v1/admin/exports/:id/download', ({ params }) => {
    const job = jobs.get(String(params.id));
    if (!job) return HttpResponse.json(errorBody('not_found', 'job not found'), { status: 404 });
    if (job.polls < 3)
      return HttpResponse.json(errorBody('conflict', 'not ready'), { status: 409 });
    if (job.request.include_deleted) {
      return HttpResponse.json(errorBody('gone', 'export expired'), { status: 410 });
    }
    return new HttpResponse(new Uint8Array([0x50, 0x4b, 0x05, 0x06]), {
      headers: { 'Content-Type': 'application/zip' },
    });
  }),
];
