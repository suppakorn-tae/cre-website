import { useMutation, useQueryClient } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

import type { ResultsResponse } from '@/features/results/overview/api';

export type Strategy = components['schemas']['RiskStrategy'];
export const STRATEGIES: readonly Strategy[] = ['REDUCE', 'TRANSFER', 'AVOID', 'ACCEPT'];

/** Same key as `useResults` in overview/api.ts (not exported there). */
const resultsKey = (projectId: string, versionId: string) =>
  ['projects', projectId, 'versions', versionId, 'results'] as const;

/** Writes one strategy into the cached results; the rest is left as stored. */
export function withStrategy(
  results: ResultsResponse,
  code: string,
  strategy: Strategy | undefined,
  updatedAt?: string,
): ResultsResponse {
  return {
    ...results,
    items: results.items.map((i) =>
      i.indicator_code === code
        ? { ...i, strategy, strategy_updated_at: updatedAt ?? i.strategy_updated_at }
        : i,
    ),
  };
}

/**
 * Saves the strategy of one H or VH indicator at once. The choice shows
 * immediately and rolls back if the api refuses it.
 */
export function useSetStrategy(projectId: string, versionId: string) {
  const queryClient = useQueryClient();
  const key = resultsKey(projectId, versionId);
  const patch = (fn: (r: ResultsResponse) => ResultsResponse) =>
    queryClient.setQueryData<ResultsResponse>(key, (old) => (old ? fn(old) : old));

  return useMutation({
    mutationFn: async ({ code, strategy }: { code: string; strategy: Strategy }) => {
      const { data } = await browserApi().PUT(
        '/projects/{project_id}/versions/{version_id}/results/{indicator_code}/strategy',
        {
          params: {
            path: { project_id: projectId, version_id: versionId, indicator_code: code },
          },
          body: { strategy },
        },
      );
      return data!;
    },
    onMutate: async ({ code, strategy }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ResultsResponse>(key);
      patch((r) => withStrategy(r, code, strategy));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (saved) =>
      patch((r) => withStrategy(r, saved.indicator_code, saved.strategy, saved.updated_at)),
  });
}
