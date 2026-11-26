import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

export const PANEL_PAGE_SIZE = 10;

export type DashboardSummary = components['schemas']['DashboardSummary'];
export type DashboardProjectItem = components['schemas']['DashboardProjectItem'];

const keys = {
  summary: ['dashboard', 'summary'] as const,
  projects: (q: string, page: number) => ['dashboard', 'projects', q, page] as const,
  allProjects: ['dashboard', 'projects', 'all'] as const,
  top: ['dashboard', 'top-indicators'] as const,
  islands: ['dashboard', 'islands'] as const,
  islandNames: ['dashboard', 'islands', 'names'] as const,
  names: ['dashboard', 'indicator-names'] as const,
};

/** KPI cards, level distribution and H/VH per project, all from stored results. */
export function useDashboard() {
  return useQuery({
    queryKey: keys.summary,
    queryFn: async () => (await browserApi().GET('/dashboard')).data!,
  });
}

/** Panel of the projects card; `q` searches name, nickname and island (code or Thai name). */
export function useProjectsPanel(q: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.projects(q, page),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await browserApi().GET('/dashboard/panels/projects', {
          params: { query: { q: q || undefined, page, page_size: PANEL_PAGE_SIZE } },
        })
      ).data!,
  });
}

/** Every project (the contract allows 100 a page) for fields the island rows do not carry. */
export function useAllProjects(enabled: boolean) {
  return useQuery({
    queryKey: keys.allProjects,
    enabled,
    queryFn: async () =>
      (
        await browserApi().GET('/dashboard/panels/projects', {
          params: { query: { page: 1, page_size: 100 } },
        })
      ).data!.items,
  });
}

export function useTopIndicatorsPanel(enabled: boolean) {
  return useQuery({
    queryKey: keys.top,
    enabled,
    queryFn: async () => (await browserApi().GET('/dashboard/panels/top-indicators')).data!.items,
  });
}

/** Island codes for the islands card note. Best effort: any failure just means no note. */
export function useIslandNames(enabled: boolean) {
  return useQuery({
    queryKey: keys.islandNames,
    enabled,
    queryFn: async () => {
      try {
        return (await browserApi().GET('/dashboard/panels/islands')).data?.items ?? [];
      } catch {
        return [];
      }
    },
  });
}

export function useIslandsPanel(enabled: boolean) {
  return useQuery({
    queryKey: keys.islands,
    enabled,
    queryFn: async () => (await browserApi().GET('/dashboard/panels/islands')).data!.items,
  });
}

/** Thai names of indicators and factors, so the Top 10 shows words, not codes. */
export function useIndicatorNames(enabled: boolean) {
  return useQuery({
    queryKey: keys.names,
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await browserApi().GET('/catalogue');
      const indicators = new Map<string, string>();
      const factors = new Map<string, string>();
      for (const d of data?.dimensions ?? []) {
        for (const f of d.factors) {
          factors.set(f.code, f.name);
          for (const i of f.indicators) indicators.set(i.code, i.name);
        }
      }
      return { indicators, factors };
    },
  });
}
