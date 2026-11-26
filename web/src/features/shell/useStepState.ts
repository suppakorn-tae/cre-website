import { skipToken, useQuery } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import { fetchVersions } from '@/features/versions/api';
import { newestFirst } from '@/features/versions/rules';

export type StepState = {
  /** The version the steps point at; the latest one when the page has none. */
  versionId: string | undefined;
  /** The version has been submitted at least once, so results and plan exist. */
  submitted: boolean;
  /** At least one strategy is chosen on the plan. */
  chosen: boolean;
};

/**
 * What the step indicator needs to know about the version. It has its own
 * cache entry and is read afresh on every page, so a version that was just
 * submitted never shows as a draft here or on the page that follows.
 */
export function useStepState(projectId: string | undefined, versionId: string | undefined) {
  return useQuery<StepState>({
    queryKey: ['step-state', projectId, versionId ?? 'latest'],
    queryFn:
      projectId === undefined
        ? skipToken
        : async () => {
            const api = browserApi();
            let id = versionId;
            let status: string | undefined;
            if (id === undefined) {
              const latest = newestFirst(await fetchVersions(projectId))[0];
              id = latest?.id;
              status = latest?.status;
            } else {
              const { data } = await api.GET('/projects/{project_id}/versions/{version_id}', {
                params: { path: { project_id: projectId, version_id: id } },
              });
              status = data?.status;
            }
            if (id === undefined || status !== 'submitted') {
              return { versionId: id, submitted: false, chosen: false };
            }
            const { data } = await api.GET('/projects/{project_id}/versions/{version_id}/results', {
              params: { path: { project_id: projectId, version_id: id } },
            });
            return {
              versionId: id,
              submitted: true,
              chosen: data?.items.some((item) => item.strategy) ?? false,
            };
          },
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30_000,
  });
}
