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
