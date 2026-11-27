import { describe, expect, it } from 'vitest';

import {
  addDays,
  durationDays,
  expectedProgress,
  isoToThaiInput,
  parseThaiDateInput,
  todayIso,
} from './dates';

describe('Buddhist era date input', () => {
  it('shows the Buddhist year', () => {
    expect(isoToThaiInput('2025-12-01')).toBe('01/12/2568');
  });

  it('reads a Buddhist or Common Era year into an ISO date', () => {
    expect(parseThaiDateInput('01/12/2568')).toBe('2025-12-01');
    expect(parseThaiDateInput('1/2/2569')).toBe('2026-02-01');
    expect(parseThaiDateInput('30/11/2027')).toBe('2027-11-30');
  });

  it('rejects text that is not a real date', () => {
    expect(parseThaiDateInput('')).toBeNull();
    expect(parseThaiDateInput('31/02/2568')).toBeNull();
    expect(parseThaiDateInput('2568-12-01')).toBeNull();
  });
});

describe('expectedProgress (BR-24)', () => {
  it('matches the hi-fi example', () => {
    // 1 Dec 2568 to 30 Nov 2570 is 729 days; 16 Nov 2569 is day 350.
    expect(durationDays('2025-12-01', '2027-11-30')).toBe(729);
    expect(expectedProgress('2025-12-01', '2027-11-30', '2026-11-16')).toEqual({
      pct: 48,
      elapsed: 350,
      duration: 729,
    });
  });

  it('clamps before the start and after the end', () => {
    expect(expectedProgress('2026-12-01', '2027-11-30', '2026-11-16')?.pct).toBe(0);
    expect(expectedProgress('2024-01-01', '2024-12-31', '2026-11-16')?.pct).toBe(100);
  });

  it('is null without a valid range', () => {
    expect(expectedProgress(null, '2027-01-01')).toBeNull();
    expect(expectedProgress('2027-01-02', '2027-01-01')).toBeNull();
  });
});

describe('todayIso', () => {
  it('uses the Bangkok calendar day', () => {
    expect(todayIso(new Date('2026-11-23T18:30:00Z'))).toBe('2026-11-24');
  });
});

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
