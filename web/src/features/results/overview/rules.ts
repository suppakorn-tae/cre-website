import { LEVELS } from '@/components/ui';

import type { IndicatorResult, ResultsResponse } from './api';

export const TOP_COUNT = 10;

/** Highest RM first; the code breaks ties so the order is stable. */
export function byRmDesc(a: IndicatorResult, b: IndicatorResult): number {
  return b.rm - a.rm || a.indicator_code.localeCompare(b.indicator_code);
}

export function topRisks(items: IndicatorResult[], count = TOP_COUNT): IndicatorResult[] {
  return [...items].sort(byRmDesc).slice(0, count);
}

/** Levels from the highest risk down, with each count and its share of the scored indicators. */
export function distribution(summary: ResultsResponse['summary']) {
  return [...LEVELS].reverse().map((level) => {
    const count = summary.level_counts[level];
    return { level, count, pct: summary.scored_count ? (count / summary.scored_count) * 100 : 0 };
  });
}

export function highCount(summary: ResultsResponse['summary']): number {
  return summary.level_counts.H + summary.level_counts.VH;
}

/** Tab ids in display order. IO-56 fills `heatmap` and `hvh`. */
export const TAB_IDS = ['overview', 'table', 'heatmap', 'hvh'] as const;
export type TabId = (typeof TAB_IDS)[number];

/** Query key of the open tab, e.g. `?tab=hvh`. */
export const TAB_PARAM = 'tab';

/** Reads the `tab` query; anything unknown falls back to the overview. */
export function parseTab(value: string | null | undefined): TabId {
  return TAB_IDS.find((id) => id === value) ?? 'overview';
}

/** Scale of the factor chart (the RM score runs 1 to 5). */
export const CHART_MIN = 1;
export const CHART_MAX = 5;
/**
 * Fallback for the H line, used only when a response carries no `level_cutoffs`
 * (an older api). The api returns the real cut-off; do not read this directly.
 */
export const FALLBACK_H_LINE_RM = 3.5;

/** Where the H line is drawn: the api's cut-off for level H, else the fallback. */
export const hLineRm = (cutoffs?: { h: number }): number => cutoffs?.h ?? FALLBACK_H_LINE_RM;

/** Bar height as a share of the plot, 0 to 100. */
export function chartPct(rm: number): number {
  const clamped = Math.min(CHART_MAX, Math.max(CHART_MIN, rm));
  return ((clamped - CHART_MIN) / (CHART_MAX - CHART_MIN)) * 100;
}

/** A bar counts as high when its stored average reaches the H line. */
export const reachesH = (rm: number, hLine: number = FALLBACK_H_LINE_RM): boolean => rm >= hLine;
