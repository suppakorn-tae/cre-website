import { useMutation, useQuery } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

export type Job = components['schemas']['Job'];
export type ExportRequest = components['schemas']['AdminExportRequest'];
export type AdminUser = components['schemas']['AdminUser'];

export const POLL_MS = 2000;
export const USER_PAGE_SIZE = 20;

/** Statuses after which the job never changes again. */
export const FINAL_STATUSES: ReadonlyArray<Job['status']> = ['done', 'failed', 'expired'];

export const isFinal = (status: Job['status']) => FINAL_STATUSES.includes(status);

/** Interval for `refetchInterval`: poll until the job reaches a final status. */
export function pollInterval(job: Job | undefined): number | false {
  return job && isFinal(job.status) ? false : POLL_MS;
}

/** Polls one job until it is done, failed or expired. */
export function useJob(id: string) {
  return useQuery({
    queryKey: ['admin-export', 'job', id],
    refetchInterval: (query) => pollInterval(query.state.data),
    queryFn: async () => {
      const { data } = await browserApi().GET('/jobs/{id}', { params: { path: { id } } });
      return data as Job;
    },
  });
}

/** Users to pick from; `q` matches e-mail or organisation. */
export function useAdminUsers(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-export', 'users', q],
    enabled,
    queryFn: async () => {
      const { data } = await browserApi().GET('/admin/users', {
        params: { query: { q: q || undefined, page: 1, page_size: USER_PAGE_SIZE } },
      });
      return data!;
    },
  });
}

/** The body for `POST /admin/exports`: `user_ids` only when scope is `selected`. */
export function buildRequest(
  scope: ExportRequest['scope'],
  userIds: string[],
  includeDeleted: boolean,
): ExportRequest {
  return scope === 'selected'
    ? { scope, user_ids: userIds, include_deleted: includeDeleted }
    : { scope, include_deleted: includeDeleted };
}

export function useRequestExport() {
  return useMutation({
    mutationFn: async (body: ExportRequest) => {
      const { data } = await browserApi().POST('/admin/exports', { body });
      return data!.job_id;
    },
  });
}

/** Downloads the ZIP. Throws ApiError: 409 not ready, 410 expired. */
export async function downloadExport(id: string): Promise<void> {
  const { data } = await browserApi().GET('/admin/exports/{job_id}/download', {
    params: { path: { job_id: id } },
    parseAs: 'blob',
  });
  const url = URL.createObjectURL(data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cre-export-${id}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
