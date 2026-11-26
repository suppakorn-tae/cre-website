import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

export type Project = components['schemas']['Project'];
export type VersionSummary = components['schemas']['VersionSummary'];

export const catalogueTotalKey = ['catalogue', 'indicator-total'] as const;
export const projectKey = (projectId: string) => ['projects', projectId] as const;
export const versionsKey = (projectId: string) => ['projects', projectId, 'versions'] as const;

export async function fetchProject(projectId: string): Promise<Project> {
  const { data } = await browserApi().GET('/projects/{project_id}', {
    params: { path: { project_id: projectId } },
  });
  if (!data) throw new Error('empty project answer');
  return data;
}

export async function fetchVersions(projectId: string): Promise<VersionSummary[]> {
  const { data } = await browserApi().GET('/projects/{project_id}/versions', {
    params: { path: { project_id: projectId } },
  });
  return data?.items ?? [];
}

/** Starts a blank version; the server copies today's project settings. */
export async function createVersion(projectId: string) {
  const { data } = await browserApi().POST('/projects/{project_id}/versions', {
    params: { path: { project_id: projectId } },
  });
  return data;
}

export async function deleteVersion(projectId: string, versionId: string): Promise<void> {
  await browserApi().DELETE('/projects/{project_id}/versions/{version_id}', {
    params: { path: { project_id: projectId, version_id: versionId } },
  });
}

/** Hides the project and all its versions from the user (the project's own delete, not a version's). */
export async function deleteProject(projectId: string): Promise<void> {
  await browserApi().DELETE('/projects/{project_id}', {
    params: { path: { project_id: projectId } },
  });
}

/** Number of indicators in the catalogue, the denominator of "scored/total". */
export async function fetchIndicatorTotal(): Promise<number> {
  const { data } = await browserApi().GET('/catalogue', { params: { query: {} } });
  let total = 0;
  for (const dimension of data?.dimensions ?? []) {
    for (const factor of dimension.factors) total += factor.indicators.length;
  }
  return total;
}
