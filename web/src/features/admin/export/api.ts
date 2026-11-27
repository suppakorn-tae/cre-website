import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { browserApi } from '@/lib/api/client';
import { EXPORT_CAP_MS, jobPhase, pollInterval } from '@/features/reports/polling';
import type { components } from '@/lib/api/generated/schema';

export type Job = components['schemas']['Job'];
export type ExportRequest = components['schemas']['AdminExportRequest'];
export type AdminUser = components['schemas']['AdminUser'];

export const USER_PAGE_SIZE = 20;

/** Statuses after which the job never changes again. */
export const FINAL_STATUSES: ReadonlyArray<Job['status']> = ['done', 'failed', 'expired'];

export const isFinal = (status: Job['status']) => FINAL_STATUSES.includes(status);

/**
 * Polls one job, backing off to 30 s. It stops when the job is done, failed or expired, or
 * when it sat in the queue for 2 minutes (`phase` is then `stalled`; `checkAgain` resumes).
 * A running job is polled with no time limit.
 */
export function useJob(id: string) {
  // When the user last asked to check again; the 2 minutes count from then.
  const [resumedAt, setResumedAt] = useState(0);
  const query = useQuery({
    queryKey: ['admin-export', 'job', id],
    refetchInterval: (q) =>
      pollInterval(
        q.state.data,
        q.state.dataUpdateCount,
        EXPORT_CAP_MS,
        q.state.dataUpdatedAt,
        resumedAt,
      ),
    queryFn: async () => {
      const { data } = await browserApi().GET('/jobs/{id}', { params: { path: { id } } });
      return data as Job;
    },
  });
  const { refetch } = query;
  const checkAgain = useCallback(() => {
    setResumedAt(Date.now());
    void refetch();
  }, [refetch]);
  // Judged at the time of the last answer, so it also renders on each one.
  const phase = jobPhase(query.data, query.dataUpdatedAt, resumedAt);
  return { ...query, phase, checkAgain };
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
