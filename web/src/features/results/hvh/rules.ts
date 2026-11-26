import { formatNumber } from '@/lib/format/locale';

export { highRisks } from '@/features/plan/rules';

/** Cards the H / VH summary shows before "… and n more". */
export const HVH_VISIBLE = 3;

/** Catalogue units that measure a share (ร้อยละ …) read with a percent sign after the value. */
const isPercentUnit = (unit: string) => unit.includes('ร้อยละ');

/**
 * Parts of the X sentence. The catalogue unit is free text ("จำนวนครั้งต่อเดือน",
 * "ร้อยละของแผนงานย่อยที่เหลือ"), a name of what was counted, so it leads the
 * sentence as a label and the value follows it ("จำนวนครั้งต่อเดือน: 11").
 * `unit` is empty when the catalogue has none.
 */
export function xInput(unit: string, x: number): { unit: string; value: string } {
  const label = unit.replace(/\s+/g, ' ').trim();
  const value = formatNumber(x);
  return { unit: label, value: isPercentUnit(label) ? `${value}%` : value };
}
