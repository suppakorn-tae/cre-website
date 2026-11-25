import { describe, expect, it } from 'vitest';

import { toggleOption } from '@/components/ui';

import {
  countGroup,
  emptyDraft,
  fromAnswer,
  isAnswered,
  isComplete,
  parseAmount,
  sharedUnit,
  toInput,
  switchSharedUnit,
  type Draft,
} from './rules';

describe('global units', () => {
  const codes = ['a', 'b'];
  it('reads the shared unit, or null when rows differ', () => {
    expect(sharedUnit(codes, {}, 'y1')).toBe('baht');
    const mixed = { a: { ...emptyDraft(), y1: { amount: '5', unit: 'percent' } } };
    expect(sharedUnit(codes, mixed, 'y1')).toBeNull();
    expect(sharedUnit(['a'], mixed, 'y1')).toBe('percent');
  });
  it('switches the unit of every row and keeps what was typed', () => {
    const drafts = { a: { ...emptyDraft(), y2: { amount: '7', unit: 'day' } } };
    const { drafts: next, changed, skipped } = switchSharedUnit(codes, drafts, 'y2', 'percent');
    expect(next.a?.y2).toEqual({ amount: '7', unit: 'percent' });
    expect(next.b?.y2).toEqual({ amount: '', unit: 'percent' });
    expect(next.a?.y1.unit).toBe('baht');
    expect(changed).toEqual(['a']);
    expect(skipped).toEqual([]);
  });
  it('leaves rows alone whose value is invalid in the new unit', () => {
    const drafts = {
      a: { ...emptyDraft(), y1: { amount: '200,000', unit: 'baht' } },
      b: { ...emptyDraft(), y1: { amount: '50', unit: 'baht' } },
      c: { ...emptyDraft(), y1: { amount: 'abc', unit: 'baht' } },
    };
    const {
      drafts: next,
      changed,
      skipped,
    } = switchSharedUnit(['a', 'b', 'c'], drafts, 'y1', 'percent');
    expect(skipped).toEqual(['a', 'c']);
    expect(next.a?.y1).toEqual({ amount: '200,000', unit: 'baht' });
    expect(next.c?.y1).toEqual({ amount: 'abc', unit: 'baht' });
    expect(next.b?.y1).toEqual({ amount: '50', unit: 'percent' });
    expect(changed).toEqual(['b']);
  });
  it('never produces an answer that drops a stored value on a unit switch', () => {
    const drafts = {
      a: { ...complete(), y1: { amount: '200000', unit: 'baht' } },
      b: { ...complete(), y1: { amount: '40', unit: 'baht' } },
    };
    const { drafts: next, changed } = switchSharedUnit(['a', 'b'], drafts, 'y1', 'percent');
    // Everything that would be saved keeps its y1 (a PATCH never clears it) in the new unit.
    for (const code of changed) {
      const body = toInput(code, next[code]!);
      expect(body.y1).toEqual({ value: 40, unit: 'percent' });
    }
    expect(changed).toEqual(['b']);
    expect(toInput('a', next.a!).y1).toEqual({ value: 200000, unit: 'baht' });
  });
});

const options = [
  { value: 'A', label: 'A', exclusive: true },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
];

const complete = (): Draft => ({
  x: '6',
  y1: { amount: '12,000,000', unit: 'baht' },
  y2: { amount: '120', unit: 'day' },
  y3: ['D'],
});

describe('y3 with A exclusive', () => {
  it('picking A clears the others', () => {
    expect(toggleOption(options, ['B', 'C'], 'A')).toEqual(['A']);
  });
  it('picking another option drops A', () => {
    expect(toggleOption(options, ['A'], 'B')).toEqual(['B']);
  });
  it('keeps several non-exclusive options', () => {
    expect(toggleOption(options, ['B'], 'C')).toEqual(['B', 'C']);
  });
});

describe('parseAmount', () => {
  it('accepts zero, decimals and thousands separators', () => {
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('9.5')).toBe(9.5);
    expect(parseAmount('12,000')).toBe(12000);
  });
  it('rejects empty, negative and non-numeric text', () => {
    for (const text of ['', ' ', '-1', 'abc', '1e', 'NaN']) expect(parseAmount(text)).toBeNull();
  });
  it('rejects a percent above 100', () => {
    expect(parseAmount('100', 100)).toBe(100);
    expect(parseAmount('100.5', 100)).toBeNull();
  });
});

describe('completeness', () => {
  it('is complete only with x, y1, y2 and y3', () => {
    expect(isComplete(complete())).toBe(true);
    expect(isComplete({ ...complete(), x: '' })).toBe(false);
    expect(isComplete({ ...complete(), y1: { amount: '', unit: 'baht' } })).toBe(false);
    expect(isComplete({ ...complete(), y2: { amount: 'x', unit: 'day' } })).toBe(false);
    expect(isComplete({ ...complete(), y3: [] })).toBe(false);
  });
  it('treats a percent above 100 as incomplete', () => {
    expect(isComplete({ ...complete(), y1: { amount: '101', unit: 'percent' } })).toBe(false);
  });
  it('answered means any field filled', () => {
    expect(isAnswered(emptyDraft())).toBe(false);
    expect(isAnswered({ ...emptyDraft(), y3: ['A'] })).toBe(true);
    expect(isAnswered({ ...emptyDraft(), x: '0' })).toBe(true);
  });
  it('counts answered and complete per group', () => {
    const drafts = { a: complete(), b: { ...emptyDraft(), x: '1' }, c: emptyDraft() };
    expect(countGroup(['a', 'b', 'c', 'd'], drafts)).toEqual({
      total: 4,
      answered: 2,
      complete: 1,
    });
  });
});

describe('payload', () => {
  it('sends parsed numbers and omits blank or invalid fields', () => {
    expect(toInput('EC-MG-1', complete())).toEqual({
      indicator_code: 'EC-MG-1',
      x: 6,
      y1: { value: 12_000_000, unit: 'baht' },
      y2: { value: 120, unit: 'day' },
      y3: ['D'],
    });
    expect(toInput('EC-MG-2', { ...emptyDraft(), x: 'abc', y3: ['A'] })).toEqual({
      indicator_code: 'EC-MG-2',
      y3: ['A'],
    });
  });
  it('round-trips a saved answer', () => {
    const draft = fromAnswer({
      indicator_code: 'EC-MG-1',
      x: 2.5,
      y1: { value: 10, unit: 'percent' },
      y3: ['B', 'C'],
      complete: false,
      updated_at: '2026-11-25T00:00:00Z',
    });
    expect(draft).toEqual({
      x: '2.5',
      y1: { amount: '10', unit: 'percent' },
      y2: { amount: '', unit: 'day' },
      y3: ['B', 'C'],
    });
  });
});
