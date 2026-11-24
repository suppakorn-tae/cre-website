import { describe, expect, it } from 'vitest';

import { confirmationState, passwordRules, passwordStrength } from './password';

describe('passwordRules', () => {
  it('requires at least 8 characters', () => {
    expect(passwordRules('').minLength).toBe(false);
    expect(passwordRules('abcdefg').minLength).toBe(false);
    expect(passwordRules('abcdefgh').minLength).toBe(true);
  });

  it('counts Thai characters as characters, not code units', () => {
    expect(passwordRules('รหัสผ่าน1').minLength).toBe(true);
    expect(passwordRules('รหัสผ่า').minLength).toBe(false);
  });
});

describe('passwordStrength', () => {
  it('shows nothing for an empty field', () => {
    expect(passwordStrength('')).toEqual({ level: 'none', bars: 0 });
  });

  it('keeps a too-short password at weak whatever it contains', () => {
    expect(passwordStrength('aB3$')).toEqual({ level: 'weak', bars: 1 });
  });

  it('grades by length and variety once the length rule is met', () => {
    expect(passwordStrength('abcdefgh').level).toBe('fair');
    expect(passwordStrength('abcdefg1').level).toBe('good');
    expect(passwordStrength('abcdefghijkl').level).toBe('good');
    expect(passwordStrength('Abcdefgh1234!').level).toBe('strong');
  });
});

describe('confirmationState', () => {
  it('compares the confirmation with the password', () => {
    expect(confirmationState('abcdefgh', '')).toBe('empty');
    expect(confirmationState('abcdefgh', 'abcdefg')).toBe('mismatch');
    expect(confirmationState('abcdefgh', 'abcdefgh')).toBe('match');
  });
});
