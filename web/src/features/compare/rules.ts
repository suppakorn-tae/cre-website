import type { TrendPoint } from './api';

/** Versions that can be compared: only submitted ones carry figures (UC-21). */
export function submittedVersions(points: TrendPoint[]): TrendPoint[] {
  return points.filter((p) => p.status === 'submitted').sort((a, b) => a.version_no - b.version_no);
}

/** Signed difference, null when either side has no figure. */
export function delta(base: number | null, target: number | null): number | null {
  return base === null || target === null ? null : target - base;
}

/** The version to compare against by default: the submitted one just before, else the nearest other. */
export function defaultBase(points: TrendPoint[], selectedId: string): string | null {
  const selected = points.find((p) => p.version_id === selectedId);
  if (!selected) return null;
  const others = submittedVersions(points).filter((p) => p.version_id !== selectedId);
  const before = others.filter((p) => p.version_no < selected.version_no);
  const pick = before.length > 0 ? before[before.length - 1] : others[0];
  return pick?.version_id ?? null;
}

/** Whether a fall or a rise is the good direction for a figure. */
export type Better = 'lower' | 'higher';
export type DeltaTone = 'good' | 'bad' | 'same';

export function deltaTone(change: number, better: Better): DeltaTone {
  if (change === 0) return 'same';
  return change < 0 === (better === 'lower') ? 'good' : 'bad';
}

/** Top of a bar axis with four equal steps, so it lines up with the 1 to 5 RM axis. */
export function barAxis(max: number): { top: number; ticks: number[] } {
  const unit = [1, 2, 5, 10, 20, 25, 50, 100].find((u) => u * 4 >= max) ?? Math.ceil(max / 4);
  return { top: unit * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * unit) };
}

/** RM at which the H and VH bands start. The compare answers carry levels, not cut-offs. */
export const RM_BANDS = { h: 3.5, vh: 4.5, min: 1, max: 5 } as const;

/** Which versions the trend chart draws. */
export type TrendFilter = 'all' | 'submitted';
export function visiblePoints(points: TrendPoint[], filter: TrendFilter): TrendPoint[] {
  return filter === 'submitted' ? points.filter((p) => p.status === 'submitted') : points;
}

/** The first `perFactor` indicators of each chosen factor, in matrix order. */
export function firstIndicators(
  rows: { indicator_code: string; factor_code: string }[],
  factors: string[],
  perFactor = 2,
): string[] {
  return factors.flatMap((factor) =>
    rows
      .filter((r) => r.factor_code === factor)
      .slice(0, perFactor)
      .map((r) => r.indicator_code),
  );
}

export type Point = { x: number; y: number };

/** SVG path that lifts the pen over gaps. */
export function linePath(points: (Point | undefined)[]): string {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    pen = true;
  }
  return d;
}
