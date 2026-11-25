import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

import type { components } from '@/lib/api/generated/schema';

type Job = components['schemas']['Job'];
type JobStatus = components['schemas']['JobStatus'];

type Options = {
  /** Make the first report job of each version fail, so retry can be tried. */
  failFirst?: boolean;
};

type Entry = { job: Job; polls: number; willFail: boolean };

const notFound = () =>
  HttpResponse.json({ error: { code: 'not_found', message: 'not found' } }, { status: 404 });

const PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

/**
 * Report jobs for any project and version. A job walks queued, running, done
 * over successive polls of `GET /jobs/{id}`; asking again for the same
 * version returns the existing job unless it failed.
 */
export function createJobHandlers({ failFirst = false }: Options = {}): HttpHandler[] {
  const jobs = new Map<string, Entry>();
  const byVersion = new Map<string, string>();
  let serial = 0;

  const statusAt = (e: Entry): JobStatus =>
    e.polls <= 0 ? 'queued' : e.polls === 1 ? 'running' : e.willFail ? 'failed' : 'done';

  return [
    mswHttp.post('*/api/v1/projects/:projectId/versions/:versionId/reports', ({ params }) => {
      const key = `${params.projectId}/${params.versionId}`;
      const existing = jobs.get(byVersion.get(key) ?? '');
      if (existing && existing.job.status !== 'failed') {
        return HttpResponse.json({ job_id: existing.job.id }, { status: 202 });
      }
      serial += 1;
      const id = `0193f6a2-0000-7000-8000-${String(serial).padStart(12, '0')}`;
      const job: Job = {
        id,
        kind: 'report',
        status: 'queued',
        created_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
        expires_at: null,
        error: null,
      };
      jobs.set(id, { job, polls: 0, willFail: failFirst && !byVersion.has(key) });
      byVersion.set(key, id);
      return HttpResponse.json({ job_id: id }, { status: 202 });
    }),

    mswHttp.get('*/api/v1/jobs/:id', ({ params }) => {
      const entry = jobs.get(String(params.id));
      if (!entry) return notFound();
      entry.job = { ...entry.job, status: statusAt(entry) };
      entry.polls += 1;
      const { status } = entry.job;
      const now = new Date().toISOString();
      if (status !== 'queued') entry.job.started_at ??= now;
      if (status === 'done' || status === 'failed') entry.job.finished_at ??= now;
      if (status === 'failed') entry.job.error = 'mock failure';
      return HttpResponse.json(entry.job);
    }),

    mswHttp.get('*/api/v1/reports/:jobId/download', ({ params }) => {
      const entry = jobs.get(String(params.jobId));
      if (!entry) return notFound();
      if (entry.job.status !== 'done') {
        return HttpResponse.json(
          { error: { code: 'conflict', message: 'report is not ready' } },
          { status: 409 },
        );
      }
      return new HttpResponse(PDF, { headers: { 'Content-Type': 'application/pdf' } });
    }),
  ];
}

export const jobHandlers: HttpHandler[] = createJobHandlers();
