export { highRisks } from '@/features/plan/rules';

/** Cards the H / VH summary shows before "… and n more". */
export const HVH_VISIBLE = 3;

/**
 * Unit of X as spoken Thai: "ครั้ง/เดือน" reads "ครั้งต่อเดือน". The catalogue
 * may write the slash with spaces around it.
 */
export function spokenUnit(unit: string): string {
  return unit
    .trim()
    .split(/\s*\/\s*/)
    .filter(Boolean)
    .join('ต่อ');
}
