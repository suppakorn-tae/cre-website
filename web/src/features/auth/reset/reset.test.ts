import { describe, expect, it } from 'vitest';

import { classifyResetFailure, maskEmail } from './reset';

const fail = (fields: Record<string, string>, status = 422, retryAfter?: number) =>
  classifyResetFailure({ status, code: 'validation_failed', fields, retryAfter });

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('name@company.co.th')).toBe('n***@company.co.th');
  });
  it('returns odd input unchanged', () => {
    expect(maskEmail('nope')).toBe('nope');
  });
});

describe('classifyResetFailure', () => {
  it('groups wrong and expired codes', () => {
    expect(fail({ '/otp': 'otp_invalid' })).toEqual({ kind: 'otp_bad' });
    expect(fail({ '/otp': 'otp_expired' })).toEqual({ kind: 'otp_bad' });
  });
  it('flags a locked code', () => {
    expect(fail({ '/otp': 'otp_locked' })).toEqual({ kind: 'locked' });
  });
  it('maps password errors', () => {
    expect(fail({ '/new_password': 'password_too_short' })).toEqual({ kind: 'password_short' });
    expect(fail({ '/new_password_confirmation': 'password_mismatch' })).toEqual({
      kind: 'mismatch',
    });
  });
  it('keeps the wait on 429', () => {
    expect(fail({}, 429, 40)).toEqual({ kind: 'rate_limited', retryAfter: 40 });
  });
  it('falls back to other', () => {
    expect(fail({}, 500)).toEqual({ kind: 'other' });
  });
});
