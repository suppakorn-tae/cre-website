import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createJobHandlers } from './jobs';

const base = 'http://localhost/api/v1';
const request = (projectId = 'p1', versionId = 'v1') =>
  fetch(`${base}/projects/${projectId}/versions/${versionId}/reports`, { method: 'POST' });
const poll = async (id: string) => (await (await fetch(`${base}/jobs/${id}`)).json()).status;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('job mocks', () => {
  it('walks queued, running, done across polls and serves the pdf', async () => {
    server.use(...createJobHandlers());
    const res = await request();
    expect(res.status).toBe(202);
    const { job_id } = await res.json();
    expect([
      await poll(job_id),
      await poll(job_id),
      await poll(job_id),
      await poll(job_id),
    ]).toEqual(['queued', 'running', 'done', 'done']);
    const pdf = await fetch(`${base}/reports/${job_id}/download`);
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf');
    expect(await pdf.text()).toMatch(/^%PDF/);
  });

  it('returns the existing job for the same version and a new one for another', async () => {
    server.use(...createJobHandlers());
    const a = (await (await request()).json()).job_id;
    expect((await (await request()).json()).job_id).toBe(a);
    expect((await (await request('p1', 'v2')).json()).job_id).not.toBe(a);
  });

  it('refuses the download before done and for unknown jobs', async () => {
    server.use(...createJobHandlers());
    const { job_id } = await (await request()).json();
    expect((await fetch(`${base}/reports/${job_id}/download`)).status).toBe(409);
    expect((await fetch(`${base}/jobs/nope`)).status).toBe(404);
    expect((await fetch(`${base}/reports/nope/download`)).status).toBe(404);
  });

  it('can fail the first job and start a new one on retry', async () => {
    server.use(...createJobHandlers({ failFirst: true }));
    const first = (await (await request()).json()).job_id;
    await poll(first);
    await poll(first);
    expect(await poll(first)).toBe('failed');
    const retry = (await (await request()).json()).job_id;
    expect(retry).not.toBe(first);
    await poll(retry);
    await poll(retry);
    expect(await poll(retry)).toBe('done');
  });
});
