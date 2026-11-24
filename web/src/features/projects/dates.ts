import { timeZone } from '@/lib/i18n/config';

const MS_PER_DAY = 86_400_000;
const BUDDHIST_OFFSET = 543;

/** Day number of an ISO date (`2026-11-24`), so differences are calendar days. */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Today's calendar date in Bangkok as an ISO date. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(now);
}

/** Input text from an ISO date: `2025-12-01` becomes `01/12/2568` (Buddhist era). */
export function isoToThaiInput(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${Number(y) + BUDDHIST_OFFSET}`;
}

/**
 * Reads `dd/mm/yyyy` typed in the Buddhist era (a Common Era year is also
 * accepted) and returns the ISO date, or null when it is not a real date.
 */
export function parseThaiDateInput(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const typedYear = Number(match[3]);
  const year = typedYear > 2400 ? typedYear - BUDDHIST_OFFSET : typedYear;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

/** Calendar days from start to end. */
export function durationDays(startIso: string, endIso: string): number {
  return dayNumber(endIso) - dayNumber(startIso);
}

export type ExpectedProgress = {
  /** 0-100, whole percent (BR-24). */
  pct: number;
  /** Calendar days since the start, clamped to the duration. */
  elapsed: number;
  duration: number;
};

/**
 * Expected progress of a project today: elapsed calendar days over duration,
 * clamped to 0-100 and rounded (BR-24). Null until both dates are valid.
 */
export function expectedProgress(
  startIso: string | null,
  endIso: string | null,
  today: string = todayIso(),
): ExpectedProgress | null {
  if (!startIso || !endIso) return null;
  const duration = durationDays(startIso, endIso);
  if (duration <= 0) return null;
  const elapsed = Math.min(duration, Math.max(0, dayNumber(today) - dayNumber(startIso)));
  const pct = Math.min(100, Math.max(0, Math.round((elapsed / duration) * 100)));
  return { pct, elapsed, duration };
}
