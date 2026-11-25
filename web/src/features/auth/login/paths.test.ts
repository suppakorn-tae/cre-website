import { describe, expect, it } from 'vitest';

import { LOGGED_OUT_PATH, LOGIN_PATH } from '@/features/shell/login-path';

import { loginReturnView } from './paths';

describe('loginReturnView', () => {
  it('shows the register offer for no_account', () => {
    expect(loginReturnView('no_account')).toEqual({ kind: 'message', key: 'noAccount' });
  });
  it('maps cancelled and account_unavailable', () => {
    expect(loginReturnView('cancelled')).toEqual({ kind: 'message', key: 'cancelled' });
    expect(loginReturnView('account_unavailable')).toEqual({
      kind: 'message',
      key: 'accountUnavailable',
    });
  });
  it('redirects on logged_in and treats unknown values as failed', () => {
    expect(loginReturnView('logged_in')).toEqual({ kind: 'redirect' });
    expect(loginReturnView('bogus')).toEqual({ kind: 'message', key: 'failed' });
    expect(loginReturnView(null)).toEqual({ kind: 'none' });
  });
});

describe('log-out redirect', () => {
  it('targets the log-in page with the logged-out flag the form reads', () => {
    expect(LOGGED_OUT_PATH).toBe(`${LOGIN_PATH}?logged_out=1`);
  });
});
