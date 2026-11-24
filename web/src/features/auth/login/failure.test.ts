import { describe, expect, it } from 'vitest';

import { classifyLoginFailure, waitParts } from './failure';
import { loginReturnView } from './paths';

describe('classifyLoginFailure', () => {
  it('treats 401 as invalid credentials', () => {
    expect(classifyLoginFailure({ status: 401, code: 'invalid_credentials' })).toEqual({
      kind: 'invalid',
    });
  });
  it('maps a deactivated account', () => {
    expect(classifyLoginFailure({ status: 403, code: 'account_unavailable' })).toEqual({
      kind: 'unavailable',
    });
  });
  it('keeps Retry-After on 429', () => {
    expect(
      classifyLoginFailure({ status: 429, code: 'too_many_requests', retryAfter: 30 }),
    ).toEqual({ kind: 'rate_limited', retryAfter: 30 });
  });
  it('falls back to other', () => {
    expect(classifyLoginFailure({ status: 500, code: 'unknown' })).toEqual({ kind: 'other' });
  });
});

describe('waitParts', () => {
  it('uses seconds for short waits and minutes for long ones', () => {
    expect(waitParts(45)).toEqual({ unit: 'seconds', value: 45 });
    expect(waitParts(600)).toEqual({ unit: 'minutes', value: 10 });
  });
});

describe('loginReturnView', () => {
  it('handles each callback result', () => {
    expect(loginReturnView(null)).toEqual({ kind: 'none' });
    expect(loginReturnView('logged_in')).toEqual({ kind: 'redirect' });
    expect(loginReturnView('no_account')).toEqual({ kind: 'message', key: 'noAccount' });
    expect(loginReturnView('account_unavailable')).toEqual({
      kind: 'message',
      key: 'accountUnavailable',
    });
    expect(loginReturnView('whatever')).toEqual({ kind: 'message', key: 'failed' });
  });
});
