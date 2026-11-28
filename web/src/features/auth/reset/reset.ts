/** `somchai.k@example.co.th` -> `s***@example.co.th` (hi-fi 1.4). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  return `${email[0]}***${email.slice(at)}`;
}

export type ResetFailure =
  | { kind: 'otp_bad' }
  | { kind: 'locked' }
  | { kind: 'password_short' }
  | { kind: 'password_common' }
  | { kind: 'mismatch' }
  | { kind: 'rate_limited'; retryAfter?: number }
  | { kind: 'other' };

type Shape = {
  status: number;
  code: string;
  fields: Record<string, string>;
  retryAfter?: number;
};

/**
 * Maps a failed reset call. Wrong and expired codes share one message, as in
 * the hi-fi ("wrong or expired, password unchanged"); a locked code needs a
 * new one.
 */
export function classifyResetFailure(error: Shape): ResetFailure {
  const otp = error.fields['/otp'];
  if (otp === 'otp_locked') return { kind: 'locked' };
  if (otp === 'otp_invalid' || otp === 'otp_expired') return { kind: 'otp_bad' };
  if (error.fields['/new_password'] === 'password_too_common') return { kind: 'password_common' };
  if (error.fields['/new_password'] === 'password_too_short') return { kind: 'password_short' };
  if (error.fields['/new_password_confirmation'] === 'password_mismatch') {
    return { kind: 'mismatch' };
  }
  if (error.status === 429) return { kind: 'rate_limited', retryAfter: error.retryAfter };
  return { kind: 'other' };
}
