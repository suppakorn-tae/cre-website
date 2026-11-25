import type { VersionSummary } from './api';

export type PlanState = { kind: 'onPlan' } | { kind: 'behind' | 'ahead'; points: number };

/** Entered progress against the expected progress (both in percent). */
export function planState(actualPct: number, expectedPct: number): PlanState {
  const diff = Math.round(expectedPct - actualPct);
  if (diff === 0) return { kind: 'onPlan' };
  return diff > 0 ? { kind: 'behind', points: diff } : { kind: 'ahead', points: -diff };
}

/** The editable version is the latest one; the server sets `editable` (BR-08). */
export function latestVersion(versions: VersionSummary[]): VersionSummary | undefined {
  return versions.find((v) => v.editable);
}

/** Two submitted versions are needed to compare (UC-21). */
export function canCompare(versions: VersionSummary[]): boolean {
  return versions.filter((v) => v.status === 'submitted').length >= 2;
}

/** Versions newest first, whatever order the server answered in. */
export function newestFirst(versions: VersionSummary[]): VersionSummary[] {
  return [...versions].sort((a, b) => b.version_no - a.version_no);
}

export const projectPaths = {
  edit: (projectId: string) => `/projects/${projectId}/edit`,
  compare: (projectId: string) => `/projects/${projectId}/compare`,
  assessment: (projectId: string, versionId: string) =>
    `/projects/${projectId}/versions/${versionId}/assessment`,
  results: (projectId: string, versionId: string) =>
    `/projects/${projectId}/versions/${versionId}/results`,
};
