import { describe, expect, it } from 'vitest';

import { toggleOption } from '@/components/ui';

import {
  countGroup,
  emptyDraft,
  fromAnswer,
  isAnswered,
  isComplete,
  parseAmount,
  toInput,
  type Draft,
} from './rules';

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
