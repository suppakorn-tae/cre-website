import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

export type VersionComparison = components['schemas']['VersionComparison'];
export type TrendPoint = components['schemas']['TrendPoint'];
export type IndicatorRmMatrix = components['schemas']['IndicatorRmMatrix'];

export const trendKey = (projectId: string) => ['projects', projectId, 'trend'] as const;
export const compareKey = (projectId: string, base: string, target: string) =>
  ['projects', projectId, 'compare', base, target] as const;
export const indicatorRmKey = (projectId: string, factors: string[]) =>
  ['projects', projectId, 'indicator-rm', factors] as const;

export async function fetchTrend(projectId: string): Promise<TrendPoint[]> {
  const { data } = await browserApi().GET('/projects/{project_id}/trend', {
    params: { path: { project_id: projectId } },
  });
  return data?.versions ?? [];
}

export async function fetchComparison(
  projectId: string,
  baseVersionId: string,
  targetVersionId: string,
): Promise<VersionComparison> {
  const { data } = await browserApi().GET('/projects/{project_id}/compare', {
    params: {
      path: { project_id: projectId },
      query: { base_version_id: baseVersionId, target_version_id: targetVersionId },
    },
  });
  if (!data) throw new Error('empty comparison answer');
  return data;
}

export async function fetchIndicatorRm(
  projectId: string,
  factorCodes: string[],
): Promise<IndicatorRmMatrix> {
  const { data } = await browserApi().GET('/projects/{project_id}/indicator-rm', {
    params: { path: { project_id: projectId }, query: { factor_code: factorCodes } },
  });
  return data ?? { versions: [], indicators: [] };
}
