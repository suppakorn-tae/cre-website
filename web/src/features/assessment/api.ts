import { useQuery } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

import { durationDays, type UnitBasis } from './rules';

export type Catalogue = components['schemas']['Catalogue'];
export type AnswerInput = components['schemas']['AnswerInput'];
export type Answer = components['schemas']['Answer'];
export type AnswerList = components['schemas']['AnswerList'];

export const catalogueKey = ['catalogue', 'th'] as const;
export const answersKey = (versionId: string) => ['answers', versionId] as const;

export function useCatalogue() {
  return useQuery({
    queryKey: catalogueKey,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await browserApi().GET('/catalogue', {
        params: { query: { locale: 'th' } },
      });
      return data as Catalogue;
    },
  });
}

export function useAnswers(projectId: string, versionId: string) {
  return useQuery({
    queryKey: answersKey(versionId),
    // Local drafts are the source of truth after the first load.
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await browserApi().GET(
        '/projects/{project_id}/versions/{version_id}/answers',
        { params: { path: { project_id: projectId, version_id: versionId } } },
      );
      return data as AnswerList;
    },
  });
}

/**
 * The project value and duration the version was created with: what y1 and y2 in % are a
 * share of. Same key as the version detail elsewhere, so the cache is shared.
 */
export function useUnitBasis(projectId: string, versionId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'versions', versionId] as const,
    queryFn: async () => {
      const { data } = await browserApi().GET('/projects/{project_id}/versions/{version_id}', {
        params: { path: { project_id: projectId, version_id: versionId } },
      });
      return data!;
    },
    select: (v): UnitBasis => ({
      valueBaht: v.value_baht,
      durationDays: durationDays(v.start_date, v.end_date),
    }),
  });
}

/** Saves a batch of answers; each replaces the stored answer of its indicator. */
export async function saveAnswers(
  projectId: string,
  versionId: string,
  answers: AnswerInput[],
): Promise<void> {
  await browserApi().PATCH('/projects/{project_id}/versions/{version_id}/answers', {
    params: { path: { project_id: projectId, version_id: versionId } },
    body: { answers },
  });
}
