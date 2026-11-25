import type { TrendPoint } from './api';

/** Versions that can be compared: only submitted ones carry figures (UC-21). */
export function submittedVersions(points: TrendPoint[]): TrendPoint[] {
  return points.filter((p) => p.status === 'submitted').sort((a, b) => a.version_no - b.version_no);
}

/** Defaults to the two newest submitted versions: older as base, newer as target. */
export function defaultPair(points: TrendPoint[]): { base: string; target: string } | null {
  const list = submittedVersions(points);
  if (list.length < 2) return null;
  return { base: list[list.length - 2].version_id, target: list[list.length - 1].version_id };
}

/** Signed difference, null when either side has no figure. */
export function delta(base: number | null, target: number | null): number | null {
  return base === null || target === null ? null : target - base;
}

export type Point = { x: number; y: number };

/** Maps values to SVG points; a null value leaves a gap (undefined entry). */
export function plotPoints(
  values: (number | null)[],
  width: number,
  height: number,
  max: number,
): (Point | undefined)[] {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) =>
    v === null ? undefined : { x: i * step, y: height - (Math.min(v, max) / max) * height },
  );
}

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
