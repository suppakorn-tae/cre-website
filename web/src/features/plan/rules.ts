import type { IndicatorResult } from '@/features/results/overview/api';
import { byRmDesc } from '@/features/results/overview/rules';

/** Route of the risk plan (step 4) of one version. */
export const planPath = (projectId: string, versionId: string) =>
  `/projects/${projectId}/versions/${versionId}/plan`;

/** Items shown before "… and n more". */
export const PLAN_VISIBLE = 6;

/** H and VH indicators only, highest RM first (the code breaks ties). */
export function highRisks(items: IndicatorResult[]): IndicatorResult[] {
  return items.filter((i) => i.level === 'H' || i.level === 'VH').sort(byRmDesc);
}

/** How many of the rows already carry a strategy. */
export function chosenCount(rows: IndicatorResult[]): number {
  return rows.filter((r) => r.strategy).length;
}

/**
 * Which "why this list" line to show. The api picks the lists (RL when
 * RL >= RI_max, else the impact lists that equal RI_max); the page only reads
 * which it sent. With no advice there is nothing to explain, so no line.
 */
export function adviceReason(advice: IndicatorResult['advice']): 'whyRl' | 'whyRi' | null {
  if (!advice || advice.length === 0) return null;
  return advice.some((list) => list.list === 'RL') ? 'whyRl' : 'whyRi';
}

/** The score chips of one row in the order RM is built: RL, RI_C, RI_T, RI_E, RI_max. */
export const PATH_STEPS = [
  ['rl', 'rl'],
  ['riC', 'ri_c'],
  ['riT', 'ri_t'],
  ['riE', 'ri_e'],
  ['riMax', 'ri_max'],
] as const;
