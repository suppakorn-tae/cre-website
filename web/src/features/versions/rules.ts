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
    `/projects/${projectId}/versions/${versionId}/assess`,
  results: (projectId: string, versionId: string) =>
    `/projects/${projectId}/versions/${versionId}/results`,
  report: (projectId: string, versionId: string) =>
    `/projects/${projectId}/versions/${versionId}/report`,
};

/** Whole days from start to end date (both `YYYY-MM-DD`). */
export function periodDays(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

const hvh = (v: VersionSummary): number | null =>
  v.high_count === null || v.very_high_count === null ? null : v.high_count + v.very_high_count;

/** Change of H+VH between the latest submitted version and the submitted one before it. */
export function hvhDelta(versions: VersionSummary[]): number | null {
  const submitted = newestFirst(versions).filter((v) => v.status === 'submitted');
  if (submitted.length < 2) return null;
  const [now, before] = [hvh(submitted[0]), hvh(submitted[1])];
  return now === null || before === null ? null : now - before;
}

/** The newest `count` versions. */
export function recentVersions(versions: VersionSummary[], count: number): VersionSummary[] {
  return newestFirst(versions).slice(0, count);
}
