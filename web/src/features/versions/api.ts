import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

export type Project = components['schemas']['Project'];
export type VersionSummary = components['schemas']['VersionSummary'];

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
