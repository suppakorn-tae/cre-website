import type { components } from '@/lib/api/generated/schema';

export type GoogleCallbackResult = components['schemas']['GoogleCallbackResult'];

/** Where a signed-in user lands after sign-up. */
export const AFTER_SIGNUP_PATH = '/';
export const LOGIN_PATH = '/login';
export const REGISTER_PATH = '/register';
export const GOOGLE_FINISH_PATH = '/register/google';
export const RETENTION_NOTICE_PATH = '/legal/retention';
export const TERMS_PATH = '/legal/terms';

export type GoogleReturnView =
  | { kind: 'finish' }
  | { kind: 'redirect' }
  | { kind: 'message'; key: 'cancelled' | 'failed' | 'accountUnavailable' };

/**
 * What the page behind the Google callback redirect shows for `?result=`.
 * A missing or unknown value is treated as a failure, never as a login.
 */
export function googleReturnView(result: string | null | undefined): GoogleReturnView {
  switch (result) {
    case 'needs_signup':
      return { kind: 'finish' };
    case 'logged_in':
      return { kind: 'redirect' };
    case 'cancelled':
      return { kind: 'message', key: 'cancelled' };
    case 'account_unavailable':
      return { kind: 'message', key: 'accountUnavailable' };
    default:
      return { kind: 'message', key: 'failed' };
  }
}
