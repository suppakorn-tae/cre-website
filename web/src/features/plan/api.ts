import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

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
 * Orders the saves of each indicator. Radio keys can change the choice faster
 * than the api answers, so the requests of one indicator run one after the
 * other, and only the newest choice may touch the cache afterwards: an older
 * answer arriving late never replaces a newer pick.
 */
export class StrategySequencer {
  private seq = new Map<string, number>();
  private tail = new Map<string, Promise<unknown>>();

  /** Numbers a new choice; call it synchronously when the choice is made. */
  next(code: string): number {
    const n = (this.seq.get(code) ?? 0) + 1;
    this.seq.set(code, n);
    return n;
  }

  /** True while no newer choice exists for the indicator. */
  isLatest(code: string, seq: number): boolean {
    return this.seq.get(code) === seq;
  }

  /** Runs `task` after the earlier saves of the same indicator have settled. */
  run<T>(code: string, task: () => Promise<T>): Promise<T> {
    const result = (this.tail.get(code) ?? Promise.resolve()).catch(() => {}).then(task);
    this.tail.set(code, result);
    return result;
  }
}

type Vars = { code: string; strategy: Strategy; seq: number };
type Before = { strategy?: Strategy; updatedAt?: string };

/**
 * Saves the strategy of one H or VH indicator at once. The choice shows
 * immediately; if the newest save is refused the row goes back to what it was
 * and the results are read again.
 */
export function useSetStrategy(projectId: string, versionId: string) {
  const queryClient = useQueryClient();
  const key = resultsKey(projectId, versionId);
  const sequencer = useRef(new StrategySequencer());
  const patch = (fn: (r: ResultsResponse) => ResultsResponse) =>
    queryClient.setQueryData<ResultsResponse>(key, (old) => (old ? fn(old) : old));

  const mutation = useMutation({
    mutationFn: ({ code, strategy }: Vars) =>
      sequencer.current.run(code, async () => {
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
      }),
    onMutate: async ({ code, strategy }): Promise<Before> => {
      await queryClient.cancelQueries({ queryKey: key });
      const row = queryClient
        .getQueryData<ResultsResponse>(key)
        ?.items.find((i) => i.indicator_code === code);
      patch((r) => withStrategy(r, code, strategy));
      return { strategy: row?.strategy, updatedAt: row?.strategy_updated_at };
    },
    onError: (_error, { code, seq }, before) => {
      if (!sequencer.current.isLatest(code, seq)) return;
      patch((r) => withStrategy(r, code, before?.strategy, before?.updatedAt));
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: (saved, { code, seq }) => {
      if (!sequencer.current.isLatest(code, seq)) return;
      patch((r) => withStrategy(r, saved.indicator_code, saved.strategy, saved.updated_at));
    },
  });

  return {
    /** Saves one choice; rejects when the api refuses it. */
    save: (code: string, strategy: Strategy) =>
      mutation.mutateAsync({ code, strategy, seq: sequencer.current.next(code) }),
  };
}
