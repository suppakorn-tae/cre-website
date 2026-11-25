import { describe, expect, it } from 'vitest';

import { classifyOtpFailure, normaliseOtp } from './otp';

const fail = (status: number, code: string, fields: Record<string, string> = {}) => ({
  status,
  code,
  fields,
});
const otp = (code: string) => fail(422, 'validation_failed', { '/otp': code });

describe('classifyOtpFailure', () => {
  it('counts down the remaining tries for a wrong code', () => {
    expect(classifyOtpFailure(otp('otp_invalid'), 1)).toEqual({ kind: 'wrong', remaining: 4 });
    expect(classifyOtpFailure(otp('otp_invalid'), 2)).toEqual({ kind: 'wrong', remaining: 3 });
  });

  it('does not lock on the fifth wrong try, only on api otp_locked', () => {
    expect(classifyOtpFailure(otp('otp_invalid'), 5)).toEqual({ kind: 'wrong', remaining: 0 });
  });

  it('maps expired, locked, missing sign-up, rate limit and taken e-mail', () => {
    expect(classifyOtpFailure(otp('otp_expired'), 0).kind).toBe('expired');
    expect(classifyOtpFailure(otp('otp_locked'), 0).kind).toBe('locked');
    expect(classifyOtpFailure(fail(404, 'no_pending_signup'), 0).kind).toBe('no_pending');
    expect(classifyOtpFailure(fail(429, 'rate_limited'), 0).kind).toBe('rate_limited');
    expect(classifyOtpFailure(fail(409, 'email_taken'), 0).kind).toBe('email_taken');
    expect(classifyOtpFailure(fail(500, 'unknown'), 0).kind).toBe('other');
  });
});

describe('normaliseOtp', () => {
  it('keeps six digits only', () => {
    expect(normaliseOtp('48 29-15x99')).toBe('482915');
    expect(normaliseOtp('abc')).toBe('');
  });
});
