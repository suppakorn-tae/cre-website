export const OTP_LENGTH = 6;
/** Wrong codes allowed before the code is voided. */
export const MAX_OTP_ATTEMPTS = 5;

export type OtpFailure =
  | { kind: 'wrong'; remaining: number }
  | { kind: 'expired' }
  | { kind: 'locked' }
  | { kind: 'no_pending' }
  | { kind: 'rate_limited' }
  | { kind: 'email_taken' }
  | { kind: 'other' };

export type FailureShape = { status: number; code: string; fields: Record<string, string> };

/**
 * Maps a failed verify call to a UI state. The api does not say how many
 * tries are left, so `wrongTries` is the count of `otp_invalid` answers
 * seen since the last code was sent, including this one.
 */
export function classifyOtpFailure(failure: FailureShape, wrongTries: number): OtpFailure {
  const otpCode = failure.fields['/otp'];
  if (otpCode === 'otp_invalid') {
    // 5 wrong codes are allowed; only the 6th makes the api answer `otp_locked`.
    return { kind: 'wrong', remaining: Math.max(0, MAX_OTP_ATTEMPTS - wrongTries) };
  }
  if (otpCode === 'otp_expired') return { kind: 'expired' };
  if (otpCode === 'otp_locked') return { kind: 'locked' };
  if (failure.code === 'no_pending_signup') return { kind: 'no_pending' };
  if (failure.code === 'email_taken') return { kind: 'email_taken' };
  if (failure.status === 429) return { kind: 'rate_limited' };
  return { kind: 'other' };
}

/** Keeps digits only and cuts to six, for typing and pasting. */
export function normaliseOtp(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
}
