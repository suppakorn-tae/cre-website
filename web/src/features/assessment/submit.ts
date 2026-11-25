import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';
import { ApiError } from '@/lib/api/errors';

export type SubmitResponse = components['schemas']['SubmitResponse'];

export type SubmitFailure = 'noComplete' | 'conflict' | 'invalid' | 'saveFailed' | 'unknown';

/** Submits (or resubmits) a version and scores every complete indicator. */
export async function submitVersion(projectId: string, versionId: string): Promise<SubmitResponse> {
  const { data } = await browserApi().POST('/projects/{project_id}/versions/{version_id}/submit', {
    params: { path: { project_id: projectId, version_id: versionId } },
  });
  return data as SubmitResponse;
}

/** 409 means a newer version exists; 422 `no_complete_indicator` means nothing to score. */
export function classifySubmitFailure(error: unknown): SubmitFailure {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.status === 409) return 'conflict';
  if (error.status === 422) {
    return error.code === 'no_complete_indicator' ? 'noComplete' : 'invalid';
  }
  return 'unknown';
}

export const resultsPath = (projectId: string, versionId: string) =>
  `/projects/${projectId}/versions/${versionId}/results`;
