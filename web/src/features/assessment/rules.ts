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

export function isComplete(d: Draft): boolean {
  return (
    parseAmount(d.x) !== null && impact(d.y1) !== null && impact(d.y2) !== null && d.y3.length > 0
  );
}

export function isAnswered(d: Draft): boolean {
  return [d.x, d.y1.amount, d.y2.amount].some((t) => t.trim() !== '') || d.y3.length > 0;
}

/** Body of one answer; blank or invalid fields are left out, which clears them. */
export function toInput(code: string, d: Draft): AnswerInput {
  const x = parseAmount(d.x);
  const y1 = impact(d.y1);
  const y2 = impact(d.y2);
  return {
    indicator_code: code,
    ...(x !== null && { x }),
    ...(y1 !== null && { y1: { value: y1, unit: d.y1.unit as 'baht' | 'percent' } }),
    ...(y2 !== null && { y2: { value: y2, unit: d.y2.unit as 'day' | 'percent' } }),
    ...(d.y3.length > 0 && { y3: d.y3 as AnswerInput['y3'] }),
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

/** Drafts with `unit` set on every listed row; typed amounts are kept. */
export function withSharedUnit(
  codes: string[],
  drafts: Drafts,
  field: UnitField,
  unit: string,
): Drafts {
  const next = { ...drafts };
  for (const code of codes) {
    const d = next[code] ?? emptyDraft();
    next[code] = { ...d, [field]: { ...d[field], unit } };
  }
  return next;
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
