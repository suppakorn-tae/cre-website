import type { IndicatorName, IndicatorResult, Level } from '../overview/api';

/** One level, the levels picked in the filter, or 'all'. An empty pick means no level filter. */
export type LevelFilter = Level | 'all' | readonly Level[];

function matchesLevel(level: Level, filter: LevelFilter): boolean {
  if (filter === 'all') return true;
  if (typeof filter === 'string') return level === filter;
  return filter.length === 0 || filter.includes(level);
}

/** Rows whose code or name contains the text (any case), at the chosen levels, in the given order. */
export function filterRows(
  items: IndicatorResult[],
  names: Map<string, IndicatorName>,
  text: string,
  level: LevelFilter,
): IndicatorResult[] {
  const q = text.trim().toLowerCase();
  return items.filter((item) => {
    if (!matchesLevel(item.level, level)) return false;
    if (!q) return true;
    const name = names.get(item.indicator_code)?.name ?? '';
    return item.indicator_code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
  });
}
