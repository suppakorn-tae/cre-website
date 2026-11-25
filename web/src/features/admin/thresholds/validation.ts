import type { components } from '@/lib/api/generated/schema';

export type Direction = components['schemas']['IndicatorDirection'];
export type RlValues = components['schemas']['AdminRlThresholdValues'];

export const SLOTS = ['a', 'b', 'c', 'd', 'e'] as const;
export type Slot = (typeof SLOTS)[number];

export type Parsed = Record<Slot, number | null>;
/** Text as typed, so the user's input is never rewritten. */
export type Draft = Record<Slot, string>;

export const toDraft = (v: Parsed): Draft => ({
  a: v.a === null ? '' : String(v.a),
  b: v.b === null ? '' : String(v.b),
  c: v.c === null ? '' : String(v.c),
  d: v.d === null ? '' : String(v.d),
  e: v.e === null ? '' : String(v.e),
});

/** Empty text is null. Anything else that is not a plain number is NaN. */
export function parseValue(text: string): number | null {
  const s = text.trim();
  if (s === '') return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

export const parseDraft = (d: Draft): Parsed => ({
  a: parseValue(d.a),
  b: parseValue(d.b),
  c: parseValue(d.c),
  d: parseValue(d.d),
  e: parseValue(d.e),
});

export type FieldCode = 'required' | 'invalid' | 'negative';
/** `pattern` and `order` belong to the whole row, not to one input. */
export type FormCode = 'pattern' | 'order';
export type Check = { fields: Partial<Record<Slot, FieldCode>>; form?: FormCode };

export const isClean = (c: Check) => Object.keys(c.fields).length === 0 && !c.form;

/** Each value a number and not negative; `allowEmpty` lets RL slots stay blank. */
function checkEach(v: Parsed, allowEmpty: boolean): Check['fields'] {
  const fields: Check['fields'] = {};
  for (const s of SLOTS) {
    const x = v[s];
    if (x === null) {
      if (!allowEmpty) fields[s] = 'required';
    } else if (Number.isNaN(x)) fields[s] = 'invalid';
    else if (x < 0) fields[s] = 'negative';
  }
  return fields;
}

const monotonic = (xs: number[], increasing: boolean) =>
  xs.every((x, i) => i === 0 || (increasing ? x > xs[i - 1] : x < xs[i - 1]));

/**
 * RL rules of the api: all of a..e, only a..c or only c..e; none negative;
 * strictly increasing, or strictly decreasing for an inverse indicator.
 */
export function checkRl(direction: Direction, v: Parsed): Check {
  const fields = checkEach(v, true);
  if (Object.keys(fields).length > 0) return { fields };
  const set = SLOTS.map((s) => (v[s] === null ? '0' : '1')).join('');
  if (!['11111', '11100', '00111'].includes(set)) return { fields: {}, form: 'pattern' };
  const values = SLOTS.map((s) => v[s]).filter((x): x is number => x !== null);
  return monotonic(values, direction === 'normal') ? { fields: {} } : { fields: {}, form: 'order' };
}

/** Inputs a stored indicator shows: a..c and c..e indicators show only their own. */
export function activeSlots(stored: Parsed): readonly Slot[] {
  if (stored.c === null) return SLOTS;
  if (stored.a === null && stored.b === null) return ['c', 'd', 'e'];
  if (stored.d === null && stored.e === null) return ['a', 'b', 'c'];
  return SLOTS;
}
