import { useQuery } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

export type ResultsResponse = components['schemas']['ResultsResponse'];
export type IndicatorResult = components['schemas']['IndicatorResult'];
export type Version = components['schemas']['Version'];
export type Level = IndicatorResult['level'];

/** Indicator text from the catalogue; results carry only the code. */
export type IndicatorName = { name: string; factorCode: string; factorName: string };

const keys = {
  version: (projectId: string, versionId: string) =>
    ['projects', projectId, 'versions', versionId] as const,
  results: (projectId: string, versionId: string) =>
    ['projects', projectId, 'versions', versionId, 'results'] as const,
  catalogue: ['catalogue', 'names'] as const,
};

export function useVersion(projectId: string, versionId: string) {
  return useQuery({
    queryKey: keys.version(projectId, versionId),
    queryFn: async () => {
      const { data } = await browserApi().GET('/projects/{project_id}/versions/{version_id}', {
        params: { path: { project_id: projectId, version_id: versionId } },
      });
      return data!;
    },
  });
}

/** Results as stored at the last submission; never recalculated here. */
export function useResults(projectId: string, versionId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.results(projectId, versionId),
    enabled,
    queryFn: async () => {
      const { data } = await browserApi().GET(
        '/projects/{project_id}/versions/{version_id}/results',
        { params: { path: { project_id: projectId, version_id: versionId } } },
      );
      return data!;
    },
  });
}

/** Indicator code to name and factor, from the catalogue. */
export function useIndicatorNames() {
  return useQuery({
    queryKey: keys.catalogue,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await browserApi().GET('/catalogue', { params: { query: {} } });
      const names = new Map<string, IndicatorName>();
      for (const dimension of data?.dimensions ?? []) {
        for (const factor of dimension.factors) {
          for (const indicator of factor.indicators) {
            names.set(indicator.code, {
              name: indicator.name,
              factorCode: factor.code,
              factorName: factor.name,
            });
          }
        }
      }
      return names;
    },
  });
}
