import { projectPaths } from '@/features/versions/rules';

import type { Project } from './validation';

/**
 * Where to go after creating a project: the assessment of version 1, which
 * the server creates with the project. The project page is the fallback for
 * a project that has no version id.
 */
export function afterCreatePath(project: Pick<Project, 'id' | 'latest_version_id'>): string {
  return project.latest_version_id
    ? projectPaths.assessment(project.id, project.latest_version_id)
    : `/projects/${project.id}`;
}
