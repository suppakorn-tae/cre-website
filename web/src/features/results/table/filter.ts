import type { IndicatorName, IndicatorResult, Level } from '../overview/api';

export type LevelFilter = Level | 'all';

/** Rows whose code or name contains the text (any case), at the chosen level, in the given order. */
export function filterRows(
  items: IndicatorResult[],
  names: Map<string, IndicatorName>,
  text: string,
  level: LevelFilter,
): IndicatorResult[] {
  const q = text.trim().toLowerCase();
  return items.filter((item) => {
    if (level !== 'all' && item.level !== level) return false;
    if (!q) return true;
    const name = names.get(item.indicator_code)?.name ?? '';
    return item.indicator_code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
  });
}
