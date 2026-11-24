import type { components } from '@/lib/api/generated/schema';

export const LOGIN_PATH = '/login';
export const FORGOT_PATH = '/forgot-password';
export const REGISTER_PATH = '/register';
/** Where a signed-in user lands: the dashboard (route assumed, no page yet). */
export const AFTER_LOGIN_PATH = '/dashboard';

type CallbackResult = components['schemas']['GoogleCallbackResult'];

export type LoginReturnView =
  | { kind: 'none' }
  | { kind: 'redirect' }
  | { kind: 'message'; key: 'noAccount' | 'cancelled' | 'failed' | 'accountUnavailable' };

/** What the log-in page shows for the Google callback `?result=`. */
export function loginReturnView(result: string | null | undefined): LoginReturnView {
  if (!result) return { kind: 'none' };
  switch (result as CallbackResult) {
    case 'logged_in':
      return { kind: 'redirect' };
    case 'no_account':
      return { kind: 'message', key: 'noAccount' };
    case 'cancelled':
      return { kind: 'message', key: 'cancelled' };
    case 'account_unavailable':
      return { kind: 'message', key: 'accountUnavailable' };
    default:
      // A missing or unknown value is a failure, never a login.
      return { kind: 'message', key: 'failed' };
  }
}
