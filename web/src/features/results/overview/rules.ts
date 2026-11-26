import { LEVELS } from '@/components/ui';

import type { IndicatorName, IndicatorResult, Level, ResultsResponse } from './api';

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

/** Height of a value label as a share of the plot (caption text over a 14rem plot, with margin). */
export const LABEL_PCT = 10;
/** Thickness of the H line as a share of the plot (2px over 14rem). */
const LINE_PCT = 1;

export type ValuePlacement = {
  /** `above` sits over the bar top, `inside` sits under it (dark text on the bar). */
  mode: 'above' | 'inside';
  /** Distance of the label's bottom edge from the plot bottom, 0 to 100. */
  bottomPct: number;
};

/**
 * Where a bar's value label goes so it never sits on the H line. The label normally
 * sits above the bar top; when the line falls within that label's height (a bar just
 * below the line), the label moves inside the bar, or just above the line when the
 * bar is too short to hold it.
 */
export function valuePlacement(rm: number, hLine: number = FALLBACK_H_LINE_RM): ValuePlacement {
  const top = chartPct(rm);
  const line = chartPct(hLine);
  const collides = top < line && line < top + LABEL_PCT;
  if (!collides) return { mode: 'above', bottomPct: top };
  if (top >= LABEL_PCT) return { mode: 'inside', bottomPct: top - LABEL_PCT };
  return { mode: 'above', bottomPct: line + LINE_PCT };
}

/** Level cut-offs of the api, or the documented defaults when a response carries none. */
export type Cutoffs = NonNullable<ResultsResponse['level_cutoffs']>;
export const FALLBACK_CUTOFFS: Cutoffs = { l: 1.5, m: 2.5, h: FALLBACK_H_LINE_RM, vh: 4.5 };

/**
 * Level that a factor's stored mean falls in, for the bar colour (hi-fi 3.3a). Display
 * only: it reads the api's cut-offs and never changes a stored level.
 */
export function levelOfMean(rm: number, cutoffs: Cutoffs = FALLBACK_CUTOFFS): Level {
  if (rm >= cutoffs.vh) return 'VH';
  if (rm >= cutoffs.h) return 'H';
  if (rm >= cutoffs.m) return 'M';
  if (rm >= cutoffs.l) return 'L';
  return 'VL';
}

/** Rows the Top 10 card shows before "show all". */
export const TOP_COLLAPSED = 5;

/** One factor of the chart: the stored RM mean plus RL and RI_max means over the same indicators. */
export type FactorSeries = {
  factorCode: string;
  scoredCount: number;
  /** Stored by the api (FR-47); never recomputed here. */
  averageRm: number;
  /** Browser mean of the stored per-indicator values; absent when no row of the factor is loaded. */
  averageRl?: number;
  averageRiMax?: number;
};

/** Factor code of an indicator: the catalogue's, else the indicator code minus its number. */
export function factorOf(code: string, names: Map<string, Pick<IndicatorName, 'factorCode'>>) {
  return names.get(code)?.factorCode ?? code.split('-').slice(0, 2).join('-');
}

/**
 * Chart series in the api's factor order. RM comes from the stored `factor_averages`;
 * RL and RI_max are the means of the stored per-indicator rows already loaded for the
 * page (the api returns no per-factor means for them). Nothing is sent to the engine.
 */
export function factorSeries(
  averages: ResultsResponse['factor_averages'],
  items: IndicatorResult[],
  names: Map<string, Pick<IndicatorName, 'factorCode'>>,
): FactorSeries[] {
  const sums = new Map<string, { n: number; rl: number; ri: number }>();
  for (const item of items) {
    const key = factorOf(item.indicator_code, names);
    const s = sums.get(key) ?? { n: 0, rl: 0, ri: 0 };
    s.n += 1;
    s.rl += item.rl;
    s.ri += item.ri_max;
    sums.set(key, s);
  }
  return averages.map((a) => {
    const s = sums.get(a.factor_code);
    return {
      factorCode: a.factor_code,
      scoredCount: a.scored_count,
      averageRm: a.average_rm,
      ...(s && { averageRl: s.rl / s.n, averageRiMax: s.ri / s.n }),
    };
  });
}
