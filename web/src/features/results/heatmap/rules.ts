import type { IndicatorName, IndicatorResult } from '../overview/api';

export type HeatCell = { code: string; name: string; item?: IndicatorResult };
export type HeatRow = {
  factorCode: string;
  factorName: string;
  cells: HeatCell[];
  vh: number;
  h: number;
};

/**
 * One row per factor, one cell per catalogue indicator in catalogue order.
 * An indicator without a stored result stays a cell without `item`
 * ("not assessed"). Levels are read as stored, never recomputed.
 */
export function heatRows(items: IndicatorResult[], names: Map<string, IndicatorName>): HeatRow[] {
  const byCode = new Map(items.map((i) => [i.indicator_code, i]));
  const rows = new Map<string, HeatRow>();
  for (const [code, meta] of names) {
    let row = rows.get(meta.factorCode);
    if (!row) {
      row = { factorCode: meta.factorCode, factorName: meta.factorName, cells: [], vh: 0, h: 0 };
      rows.set(meta.factorCode, row);
    }
    const item = byCode.get(code);
    row.cells.push({ code, name: meta.name, item });
    if (item?.level === 'VH') row.vh += 1;
    if (item?.level === 'H') row.h += 1;
  }
  return [...rows.values()];
}
