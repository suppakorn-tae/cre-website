import { describe, expect, it } from 'vitest';

import { formatBaht, formatDate, formatDateTime, formatNumber } from './locale';

describe('formatDate', () => {
  it('renders Buddhist era for th', () => {
    expect(formatDate('2026-11-24T05:00:00Z')).toBe('24 พ.ย. 2569');
  });

  it('renders Common Era for en', () => {
    expect(formatDate('2026-11-24T05:00:00Z', 'en')).toBe('24 Nov 2026');
  });

  it('uses Bangkok time at the day boundary', () => {
    expect(formatDate('2026-11-23T18:00:00Z')).toBe('24 พ.ย. 2569');
  });

  it('accepts Date and epoch input', () => {
    const d = new Date('2026-01-01T05:00:00Z');
    expect(formatDate(d)).toBe('1 ม.ค. 2569');
    expect(formatDate(d.getTime())).toBe('1 ม.ค. 2569');
  });

  it('rejects invalid dates', () => {
    expect(() => formatDate('nope')).toThrow(RangeError);
  });
});

describe('formatDateTime', () => {
  it('adds 24h time in Bangkok', () => {
    expect(formatDateTime('2026-11-24T05:30:00Z')).toContain('12:30');
  });
});

describe('formatNumber', () => {
  it('groups digits with western numerals', () => {
    expect(formatNumber(1234567.5)).toBe('1,234,567.5');
  });
  it('passes options through', () => {
    expect(formatNumber(0.256, 'th', { style: 'percent' })).toBe('26%');
  });
});

describe('formatBaht', () => {
  it('formats th baht', () => {
    expect(formatBaht(1234567.5)).toBe('฿1,234,567.50');
  });
  it('formats en baht', () => {
    expect(formatBaht(1234567.5, 'en').replace(/\u00a0/g, ' ')).toBe('THB 1,234,567.50');
  });
});
