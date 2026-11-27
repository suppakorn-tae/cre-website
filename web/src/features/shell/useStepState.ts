import { skipToken, useQuery, type QueryClient } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import { fetchVersions, versionsKey } from '@/features/versions/api';
import { newestFirst } from '@/features/versions/rules';

export type StepState = {
  /** The version the steps point at; the latest one when the page has none. */
  versionId: string | undefined;
  /** The version has been submitted at least once, so results and plan exist. */
  submitted: boolean;
  /** At least one strategy is chosen on the plan. */
  chosen: boolean;
};

export const stepStateKey = (projectId: string | undefined, versionId: string | undefined) =>
  ['step-state', projectId, versionId ?? 'latest'] as const;

// The keys the step pages read with, so the step bar shares their cache.
const versionKey = (projectId: string, versionId: string) =>
  ['projects', projectId, 'versions', versionId] as const;
const resultsKey = (projectId: string, versionId: string) =>
  [...versionKey(projectId, versionId), 'results'] as const;

/**
 * Call after a version is submitted. The version, the version list, its results
 * and the step state can all have changed, so they are read afresh the next time
 * a page or the step bar asks. Until then they are served from the cache.
 */
export function invalidateAfterSubmit(client: QueryClient, projectId: string) {
  void client.invalidateQueries({ queryKey: ['projects', projectId, 'versions'] });
  void client.invalidateQueries({ queryKey: ['step-state', projectId] });
}

/**
 * What the step indicator needs to know about the version. It reads the version,
 * the version list and the results through the same cache entries as the pages,
 * so moving between step pages asks the server for nothing the page already has.
 * `invalidateAfterSubmit` makes a version that was just submitted show as such.
 */
export function useStepState(projectId: string | undefined, versionId: string | undefined) {
  return useQuery<StepState>({
    queryKey: stepStateKey(projectId, versionId),
    queryFn:
      projectId === undefined
        ? skipToken
        : async ({ client: qc }) => {
            const api = browserApi();
            let id = versionId;
            let status: string | undefined;
            if (id === undefined) {
              const list = await qc.fetchQuery({
                queryKey: versionsKey(projectId),
                queryFn: () => fetchVersions(projectId),
              });
              const latest = newestFirst(list)[0];
              id = latest?.id;
              status = latest?.status;
            } else {
              const vid = id;
              const data = await qc.fetchQuery({
                queryKey: versionKey(projectId, vid),
                queryFn: async () => {
                  const { data } = await api.GET('/projects/{project_id}/versions/{version_id}', {
                    params: { path: { project_id: projectId, version_id: vid } },
                  });
                  return data!;
                },
              });
              status = data?.status;
            }
            if (id === undefined || status !== 'submitted') {
              return { versionId: id, submitted: false, chosen: false };
            }
            const vid = id;
            const results = await qc.fetchQuery({
              queryKey: resultsKey(projectId, vid),
              queryFn: async () => {
                const { data } = await api.GET(
                  '/projects/{project_id}/versions/{version_id}/results',
                  { params: { path: { project_id: projectId, version_id: vid } } },
                );
                return data!;
              },
            });
            return {
              versionId: id,
              submitted: true,
              chosen: results?.items.some((item) => item.strategy) ?? false,
            };
          },
    gcTime: 30_000,
  });
}
