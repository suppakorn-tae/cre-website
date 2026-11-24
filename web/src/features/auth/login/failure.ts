export type LoginFailure =
  | { kind: 'invalid' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited'; retryAfter?: number }
  | { kind: 'other' };

type Shape = { status: number; code: string; retryAfter?: number };

/** Maps a failed log-in call to a banner. */
export function classifyLoginFailure(error: Shape): LoginFailure {
  if (error.status === 429) return { kind: 'rate_limited', retryAfter: error.retryAfter };
  if (error.status === 403 && error.code === 'account_unavailable') return { kind: 'unavailable' };
  if (error.status === 401) return { kind: 'invalid' };
  return { kind: 'other' };
}

/** Wait shown to the user: whole minutes when long, seconds otherwise. */
export function waitParts(seconds: number): { unit: 'seconds' | 'minutes'; value: number } {
  return seconds > 90
    ? { unit: 'minutes', value: Math.ceil(seconds / 60) }
    : { unit: 'seconds', value: seconds };
}
