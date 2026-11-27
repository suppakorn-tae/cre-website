import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

export type Job = components['schemas']['Job'];

export const jobKey = (jobId: string) => ['jobs', jobId] as const;
/** When this tab started waiting for a job; under the job's key, so it goes with the job. */
export const jobWaitKey = (jobId: string) => [...jobKey(jobId), 'wait'] as const;
/** One version, under the key the results page reads it with, so its cache is shared. */
export const versionKey = (projectId: string, versionId: string) =>
  ['projects', projectId, 'versions', versionId] as const;
/** One version's results, under the key the results and plan pages read them with. */
export const resultsKey = (projectId: string, versionId: string) =>
  [...versionKey(projectId, versionId), 'results'] as const;
/** The job of one version's report, kept per version so it survives moving between pages. */
export const reportJobKey = (projectId: string, versionId: string) =>
  ['reports', 'job', projectId, versionId] as const;

/**
 * Asks for a report. The server returns the version's current job when what the PDF shows has
 * not changed since it was asked for, otherwise a new job.
 */
export async function requestReport(projectId: string, versionId: string): Promise<string> {
  const { data } = await browserApi().POST('/projects/{project_id}/versions/{version_id}/reports', {
    params: { path: { project_id: projectId, version_id: versionId } },
  });
  if (!data) throw new Error('empty report answer');
  return data.job_id;
}

export async function fetchJob(jobId: string): Promise<Job> {
  const { data } = await browserApi().GET('/jobs/{id}', { params: { path: { id: jobId } } });
  if (!data) throw new Error('empty job answer');
  return data;
}

/** The api streams the PDF after its own session and ownership check. */
export const downloadUrl = (jobId: string) => `/api/v1/reports/${jobId}/download`;
