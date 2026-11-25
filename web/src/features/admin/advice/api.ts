import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

import type { AdviceItems, AdviceList } from './rules';

export type AdminAdvice = components['schemas']['AdminAdviceLists'];

const keys = {
  catalogue: ['catalogue'] as const,
  advice: (code: string) => ['admin', 'advice', code] as const,
};

/** Dimensions, factors and indicators, for the picker. */
export function useIndicatorCatalogue() {
  return useQuery({
    queryKey: keys.catalogue,
    queryFn: async () => {
      const { data } = await browserApi().GET('/catalogue', {});
      return data!;
    },
  });
}

/** The four advice lists of one indicator. */
export function useAdvice(code: string) {
  return useQuery({
    queryKey: keys.advice(code),
    queryFn: async () => {
      const { data } = await browserApi().GET('/admin/advice/{indicator_code}', {
        params: { path: { indicator_code: code } },
      });
      return data as AdminAdvice;
    },
  });
}

/** Replaces one list. The stored list from the answer goes straight into the cache. */
export function useReplaceList(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { list: AdviceList; items: AdviceItems }) => {
      const { data } = await browserApi().PUT('/admin/advice/{indicator_code}/{list}', {
        params: { path: { indicator_code: code, list: v.list } },
        body: { items: v.items },
      });
      return data!;
    },
    onSuccess: (saved) =>
      queryClient.setQueryData<AdminAdvice>(keys.advice(code), (old) =>
        old
          ? {
              ...old,
              lists: { ...old.lists, [saved.list]: saved.items },
              updated_at: saved.updated_at,
              updated_by: saved.updated_by,
            }
          : old,
      ),
  });
}
