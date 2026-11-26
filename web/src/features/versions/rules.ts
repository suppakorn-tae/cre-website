import type { CompareViewName } from '@/features/compare/ComparePanel';

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

export type ProjectTabName = 'overview' | 'versions';

export const projectPaths = {
  edit: (projectId: string) => `/projects/${projectId}/edit`,
  /** The versions tab, optionally on the RM-per-indicator view. */
  versions: (projectId: string, view?: CompareViewName) =>
    `/projects/${projectId}?tab=versions${view === 'rm' ? '&view=rm' : ''}`,
  assessment: (projectId: string, versionId: string) =>
    `/projects/${projectId}/versions/${versionId}/assess`,
  results: (projectId: string, versionId: string) =>
    `/projects/${projectId}/versions/${versionId}/results`,
  plan: (projectId: string, versionId: string) =>
    `/projects/${projectId}/versions/${versionId}/plan`,
};

/** `?tab=` and `?view=` of the project page; anything unknown falls back to the defaults. */
export function readProjectView(params: { get(name: string): string | null }): {
  tab: ProjectTabName;
  view: CompareViewName;
} {
  return {
    tab: params.get('tab') === 'versions' ? 'versions' : 'overview',
    view: params.get('view') === 'rm' ? 'rm' : 'summary',
  };
}

/** Progress at submit per version id, for the labels under the charts. */
export function progressByVersion(versions: VersionSummary[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of versions) {
    if (v.progress_at_submit !== null) out[v.id] = v.progress_at_submit;
  }
  return out;
}

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

export const LEVEL_ORDER = ['VL', 'L', 'M', 'H', 'VH'] as const;

/** The five counts, VL to VH, or null while the version is a draft (nothing stored). */
export function levelParts(v: VersionSummary) {
  const counts = v.level_counts;
  if (!counts) return null;
  return LEVEL_ORDER.map((level) => ({ level, count: counts[level] }));
}
