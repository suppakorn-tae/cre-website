import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { components } from '@/lib/api/generated/schema';

import type { ImpactValues, RlValues } from './validation';

export type RlThreshold = components['schemas']['AdminRlThreshold'];
export type ImpactTables = components['schemas']['AdminImpactTables'];

/** Indicator name and the factor it belongs to, from the catalogue. */
export type IndicatorInfo = { name: string; factorCode: string };

const keys = {
  rl: ['admin-thresholds', 'rl'] as const,
  impact: ['admin-thresholds', 'impact'] as const,
  names: ['admin-thresholds', 'names'] as const,
};

export function useRlThresholds() {
  return useQuery({
    queryKey: keys.rl,
    queryFn: async () => (await browserApi().GET('/admin/rl-thresholds')).data!.items,
  });
}

/** Names come from the catalogue; the threshold list only carries codes. */
export function useIndicatorInfo() {
  return useQuery({
    queryKey: keys.names,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await browserApi().GET('/catalogue');
      const info = new Map<string, IndicatorInfo>();
      const factors: { code: string; name: string }[] = [];
      for (const d of data!.dimensions) {
        for (const f of d.factors) {
          factors.push({ code: f.code, name: f.name });
          for (const i of f.indicators) {
            info.set(i.code, { name: i.name, factorCode: f.code });
          }
        }
      }
      return { info, factors };
    },
  });
}

export function useUpdateRl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { code: string; thresholds: RlValues }) =>
      (
        await browserApi().PUT('/admin/rl-thresholds/{indicator_code}', {
          params: { path: { indicator_code: v.code } },
          body: { thresholds: v.thresholds },
        })
      ).data!,
    onSuccess: (saved) =>
      qc.setQueryData<RlThreshold[]>(keys.rl, (rows) =>
        rows?.map((r) => (r.indicator_code === saved.indicator_code ? saved : r)),
      ),
  });
}

export function useImpactTables() {
  return useQuery({
    queryKey: keys.impact,
    queryFn: async () => (await browserApi().GET('/admin/impact-tables')).data!,
  });
}

export function useUpdateImpact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { ri_c: ImpactValues; ri_t: ImpactValues }) =>
      (await browserApi().PUT('/admin/impact-tables', { body })).data!,
    onSuccess: (saved) => qc.setQueryData(keys.impact, saved),
  });
}

/** Catalogue key of the message for a failed save; 422 means a rule slipped past the form. */
export function saveErrorKey(error: unknown): 'rejected' | 'network' | 'unknown' {
  if (error instanceof ApiError) return error.status === 422 ? 'rejected' : 'unknown';
  return error instanceof TypeError ? 'network' : 'unknown';
}
