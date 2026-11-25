import type { IndicatorResult } from '../overview/api';
import { byRmDesc } from '../overview/rules';

/** H and VH indicators only, highest RM first (the code breaks ties). */
export function highRisks(items: IndicatorResult[]): IndicatorResult[] {
  return items.filter((i) => i.level === 'H' || i.level === 'VH').sort(byRmDesc);
}
