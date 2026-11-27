import { describe, expect, it } from 'vitest';

import {
  caretAfterFormat,
  deleteAcrossComma,
  formatBahtInput,
  hasTooManyDecimals,
  stripGrouping,
} from './baht';

describe('formatBahtInput', () => {
  it.each([
    ['1250000', '1,250,000'],
    ['1250000.5', '1,250,000.5'],
    ['1250000.50', '1,250,000.50'],
    ['0.75', '0.75'],
    ['', ''],
    ['1,250,000', '1,250,000'],
    ['1,2500,00', '1,250,000'],
    ['999', '999'],
    ['1000', '1,000'],
    ['1250000.', '1,250,000.'],
    ['.5', '.5'],
  ])('%j -> %j', (input, expected) => {
    expect(formatBahtInput(input)).toBe(expected);
  });

  it('leaves text that is not a number as typed', () => {
    expect(formatBahtInput('12a3')).toBe('12a3');
    expect(formatBahtInput('1.2.3')).toBe('1.2.3');
  });

  it('flags more than 2 decimals', () => {
    expect(hasTooManyDecimals('1,250.505')).toBe(true);
    expect(hasTooManyDecimals('1,250.50')).toBe(false);
    expect(hasTooManyDecimals('1,250')).toBe(false);
  });

  it('strips commas for saving', () => {
    expect(stripGrouping('1,250,000.50')).toBe('1250000.50');
  });
});

describe('caret', () => {
  it('stays after the new digit when typing in the middle', () => {
    // "1,250,000", caret after "1,2", the user types "9": raw "1,29" + "50,000", caret 4.
    const raw = '1,2950,000';
    const formatted = formatBahtInput(raw);
    expect(formatted).toBe('12,950,000');
    expect(caretAfterFormat(raw, 4, formatted)).toBe(4);
  });

  it('moves past a comma that appears before the caret', () => {
    const raw = '1000';
    expect(caretAfterFormat(raw, 4, formatBahtInput(raw))).toBe(5);
  });

  it('stays at the end when typing at the end', () => {
    const raw = '1,250,0001';
    const formatted = formatBahtInput(raw);
    expect(caretAfterFormat(raw, raw.length, formatted)).toBe(formatted.length);
  });

  it('backspace over a comma deletes the digit before it', () => {
    expect(deleteAcrossComma('1,250,000', 2, false)).toEqual({ text: '250,000', caret: 0 });
    expect(deleteAcrossComma('12,250,000', 3, false)).toEqual({ text: '1,250,000', caret: 1 });
  });

  it('delete before a comma deletes the digit after it', () => {
    expect(deleteAcrossComma('1,250,000', 1, true)).toEqual({ text: '150,000', caret: 1 });
  });

  it('ignores keys that do not touch a comma', () => {
    expect(deleteAcrossComma('1,250,000', 3, false)).toBeNull();
  });
});
