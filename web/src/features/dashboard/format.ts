import { formatNumber } from '@/lib/format/locale';

const BAHT_PER_MILLION = 1_000_000;

/** Baht as million baht with at most one decimal, e.g. 203,500,000 -> "203.5". */
export function formatMillionBaht(baht: number): string {
  return formatNumber(baht / BAHT_PER_MILLION, undefined, { maximumFractionDigits: 1 });
}
