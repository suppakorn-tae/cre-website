import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/features/auth/register/password';

export const MAX_ORGANISATION = 200;
export const ACCOUNT_PATH = '/account';
export const AFTER_DELETE_PATH = '/login?logged_out=1';

type Shape = {
  status: number;
  code: string;
  fields: Record<string, string>;
  retryAfter?: number;
};

export function organisationError(value: string): 'tooLong' | undefined {
  return [...value.trim()].length > MAX_ORGANISATION ? 'tooLong' : undefined;
}

export type PasswordErrors = Partial<
  Record<
    'current' | 'next' | 'confirmation',
    | 'currentRequired'
    | 'currentIncorrect'
    | 'tooShort'
    | 'tooLong'
    | 'tooCommon'
    | 'confirmationRequired'
    | 'mismatch'
  >
>;

/** Checks the change-password form before the api call; empty object means valid. */
export function validatePasswordChange(input: {
  current: string;
  next: string;
  confirmation: string;
}): PasswordErrors {
  const errors: PasswordErrors = {};
  const length = [...input.next].length;
  if (input.current === '') errors.current = 'currentRequired';
  if (length < MIN_PASSWORD_LENGTH) errors.next = 'tooShort';
  else if (length > MAX_PASSWORD_LENGTH) errors.next = 'tooLong';
  if (input.confirmation === '') errors.confirmation = 'confirmationRequired';
  else if (input.confirmation !== input.next) errors.confirmation = 'mismatch';
  return errors;
}

export type PasswordFailure =
  | { kind: 'fields'; errors: PasswordErrors }
  | { kind: 'no_password' }
  | { kind: 'rate_limited'; retryAfter?: number }
  | { kind: 'other' };

/** Maps a failed change-password call (codes of `changePassword` in the contract). */
export function classifyPasswordFailure(error: Shape): PasswordFailure {
  if (error.status === 429) return { kind: 'rate_limited', retryAfter: error.retryAfter };
  if (error.status === 409 && error.code === 'no_password') return { kind: 'no_password' };
  if (error.status === 422) {
    const errors: PasswordErrors = {};
    if (error.fields['/current_password'] === 'current_password_incorrect')
      errors.current = 'currentIncorrect';
    if (error.fields['/new_password'] === 'password_too_common') errors.next = 'tooCommon';
    if (error.fields['/new_password'] === 'password_too_short') errors.next = 'tooShort';
    if (error.fields['/new_password_confirmation'] === 'password_mismatch')
      errors.confirmation = 'mismatch';
    if (Object.keys(errors).length > 0) return { kind: 'fields', errors };
  }
  return { kind: 'other' };
}

export type DeleteFailure = 'passwordIncorrect' | 'reauthRequired' | 'rate_limited' | 'other';

/** Maps a failed delete-account call (UC-04 1a). */
export function classifyDeleteFailure(error: Shape): DeleteFailure {
  if (error.status === 429) return 'rate_limited';
  if (error.status === 422 && error.fields['/current_password'] === 'current_password_incorrect')
    return 'passwordIncorrect';
  if (error.status === 403 && error.code === 'reauth_required') return 'reauthRequired';
  return 'other';
}

export type UnlinkFailure = 'passwordRequired' | 'rate_limited' | 'other';

export function classifyUnlinkFailure(error: Shape): UnlinkFailure {
  if (error.status === 429) return 'rate_limited';
  if (error.status === 409 && error.code === 'password_required') return 'passwordRequired';
  return 'other';
}

/** Unlinking Google needs a password to remain (UC-04 1f). */
export function canUnlinkGoogle(methods: { password: boolean; google: boolean }): boolean {
  return methods.google && methods.password;
}

export type ResultNotice = {
  tone: 'success' | 'error';
  key: 'linked' | 'alreadyLinked' | 'reauthenticated' | 'cancelled' | 'failed';
};

/**
 * Notice for the `?result=` the Google callback redirects back with.
 * Other results (log-in ones) mean nothing here and show nothing.
 */
export function resultNotice(result: string | null | undefined): ResultNotice | null {
  switch (result) {
    case 'linked':
      return { tone: 'success', key: 'linked' };
    case 'reauthenticated':
      return { tone: 'success', key: 'reauthenticated' };
    case 'already_linked':
      return { tone: 'error', key: 'alreadyLinked' };
    case 'cancelled':
      return { tone: 'error', key: 'cancelled' };
    case 'failed':
      return { tone: 'error', key: 'failed' };
    default:
      return null;
  }
}

/** Wait shown to the user: whole minutes when long, seconds otherwise. */
export function waitParts(seconds: number | undefined): {
  unit: 'seconds' | 'minutes' | 'unknown';
  value: number;
} {
  if (!seconds) return { unit: 'unknown', value: 0 };
  return seconds > 90
    ? { unit: 'minutes', value: Math.ceil(seconds / 60) }
    : { unit: 'seconds', value: seconds };
}
