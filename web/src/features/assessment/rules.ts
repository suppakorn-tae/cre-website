import type { UnitValue } from '@/components/ui';

import type { Answer, AnswerInput } from './api';

/** What the user typed for one indicator. Numbers stay text so typing is never rewritten. */
export type Draft = {
  x: string;
  y1: UnitValue;
  y2: UnitValue;
  y3: string[];
};

export const COST_UNITS = ['baht', 'percent'] as const;
export const TIME_UNITS = ['day', 'percent'] as const;

export const emptyDraft = (): Draft => ({
  x: '',
  y1: { amount: '', unit: 'baht' },
  y2: { amount: '', unit: 'day' },
  y3: [],
});

/** A number of 0 or more (at most `max`), or null for blank or invalid text. */
export function parseAmount(text: string, max?: number): number | null {
  const clean = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  return max !== undefined && value > max ? null : value;
}

const impact = (v: UnitValue) => parseAmount(v.amount, v.unit === 'percent' ? 100 : undefined);

/** The y3 option that cannot be combined with any other (A, "no impact"). */
export const EXCLUSIVE_Y3 = 'A';

/** True when the exclusive y3 option is chosen together with another one. */
export const y3Conflict = (y3: string[]): boolean => y3.length > 1 && y3.includes(EXCLUSIVE_Y3);

export function isComplete(d: Draft): boolean {
  return (
    parseAmount(d.x) !== null &&
    impact(d.y1) !== null &&
    impact(d.y2) !== null &&
    d.y3.length > 0 &&
    !y3Conflict(d.y3)
  );
}

export function isAnswered(d: Draft): boolean {
  return [d.x, d.y1.amount, d.y2.amount].some((t) => t.trim() !== '') || d.y3.length > 0;
}

/** How many of the four fields (X, y1, y2, y3) have an answer. */
export function answeredFields(d: Draft): number {
  const typed = [d.x, d.y1.amount, d.y2.amount].filter((t) => t.trim() !== '').length;
  return typed + (d.y3.length > 0 ? 1 : 0);
}

/** Body of one answer; blank or invalid fields (also a y3 with A and another option) are left out, which clears them. */
export function toInput(code: string, d: Draft): AnswerInput {
  const x = parseAmount(d.x);
  const y1 = impact(d.y1);
  const y2 = impact(d.y2);
  return {
    indicator_code: code,
    ...(x !== null && { x }),
    ...(y1 !== null && { y1: { value: y1, unit: d.y1.unit as 'baht' | 'percent' } }),
    ...(y2 !== null && { y2: { value: y2, unit: d.y2.unit as 'day' | 'percent' } }),
    ...(d.y3.length > 0 && !y3Conflict(d.y3) && { y3: d.y3 as AnswerInput['y3'] }),
  };
}

export function fromAnswer(a: Answer): Draft {
  const base = emptyDraft();
  return {
    x: a.x === undefined ? '' : String(a.x),
    y1: a.y1 ? { amount: String(a.y1.value), unit: a.y1.unit } : base.y1,
    y2: a.y2 ? { amount: String(a.y2.value), unit: a.y2.unit } : base.y2,
    y3: a.y3 ?? [],
  };
}

type UnitField = 'y1' | 'y2';
type Drafts = Record<string, Draft | undefined>;

/** The unit every listed row uses for `field`, or null when rows differ. */
export function sharedUnit(codes: string[], drafts: Drafts, field: UnitField): string | null {
  const units = new Set(codes.map((c) => (drafts[c] ?? emptyDraft())[field].unit));
  return units.size === 1 ? ([...units][0] ?? null) : null;
}

/** What a percentage of y1 or y2 is a share of: the version's project value and duration. */
export type UnitBasis = { valueBaht: number; durationDays: number };

/** Project duration in days, end minus start, as the Assessments Service counts it. */
export function durationDays(start: string, end: string): number {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000;
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Converts an amount to `to` against `base` (project value for y1, duration for y2):
 * baht and days become % with 2 decimals, % becomes whole baht or days. Null when
 * `base` is not above 0, so nothing can be converted.
 */
export function convertAmount(amount: number, to: string, base: number): number | null {
  if (!(base > 0)) return null;
  return to === 'percent' ? round2((amount * 100) / base) : Math.round((amount * base) / 100);
}

/**
 * Sets `unit` on the listed rows and converts their amounts with `basis`. A row whose
 * amount cannot be converted (invalid text, no basis yet, or above 100 % once converted)
 * keeps its unit and value, so a unit switch never turns a stored value into an invalid
 * one. `changed` lists rows whose amount was converted (the only ones that need saving);
 * `skipped` lists the kept rows.
 */
export function switchSharedUnit(
  codes: string[],
  drafts: Drafts,
  field: UnitField,
  unit: string,
  basis?: UnitBasis,
): { drafts: Drafts; changed: string[]; skipped: string[] } {
  const next = { ...drafts };
  const changed: string[] = [];
  const skipped: string[] = [];
  const base = field === 'y1' ? basis?.valueBaht : basis?.durationDays;
  for (const code of codes) {
    const d = next[code] ?? emptyDraft();
    if (d[field].unit === unit) continue;
    if (d[field].amount.trim() === '') {
      next[code] = { ...d, [field]: { amount: '', unit } };
      continue;
    }
    const from = impact(d[field]);
    const to = from === null || base === undefined ? null : convertAmount(from, unit, base);
    if (to === null || (unit === 'percent' && to > 100)) {
      skipped.push(code);
      continue;
    }
    next[code] = { ...d, [field]: { amount: String(to), unit } };
    changed.push(code);
  }
  return { drafts: next, changed, skipped };
}

export function countGroup(codes: string[], drafts: Record<string, Draft | undefined>) {
  let answered = 0;
  let complete = 0;
  for (const code of codes) {
    const d = drafts[code];
    if (d && isAnswered(d)) answered += 1;
    if (d && isComplete(d)) complete += 1;
  }
  return { total: codes.length, answered, complete };
}
