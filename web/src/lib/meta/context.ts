import { connection } from 'next/server';

import { serverApi } from '@/lib/api/server';
import { sessionFor } from '@/features/shell/guard';

import { versionContext } from './title';

/**
 * Reads context for a page title on the server. Like the session guard it is
 * per request, so it opts out of prerendering first: without `connection()`
 * Next's validation render reaches the api client's random request id and
 * reports "unstable value `Math.random()`" on every title page. A failed read
 * gives `undefined`: the title then has no context and the page shows the
 * error.
 */
export async function projectTitleData(
  projectId: string,
): Promise<{ nickname: string; name: string } | undefined> {
  try {
    await connection();
    const api = await serverApi();
    const { data } = await api.GET('/projects/{project_id}', {
      params: { path: { project_id: projectId } },
    });
    return data ? { nickname: data.nickname, name: data.name } : undefined;
  } catch {
    return undefined;
  }
}

export async function versionTitleContext(
  projectId: string,
  versionId: string,
): Promise<string | undefined> {
  try {
    await connection();
    const api = await serverApi();
    const path = { project_id: projectId, version_id: versionId };
    const [project, version] = await Promise.all([
      api.GET('/projects/{project_id}', { params: { path } }),
      api.GET('/projects/{project_id}/versions/{version_id}', { params: { path } }),
    ]);
    if (!project.data || !version.data) return undefined;
    return versionContext(project.data.nickname, version.data.version_no);
  } catch {
    return undefined;
  }
}

/**
 * The e-mail of the user an admin is looking at. The admin check comes first,
 * from the request's session (the same `/auth/me` answer the admin layout
 * uses), so a non-admin never triggers the read and gets the generic title,
 * whatever the api would answer.
 */
export async function adminUserEmail(userId: string): Promise<string | undefined> {
  try {
    await sessionFor('admin');
    const api = await serverApi();
    const { data } = await api.GET('/admin/users/{user_id}', {
      params: { path: { user_id: userId } },
    });
    return data?.email ?? undefined;
  } catch {
    return undefined;
  }
}
