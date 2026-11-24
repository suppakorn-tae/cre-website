import { describe, expect, it } from 'vitest';

import { googleReturnView } from './google';

describe('googleReturnView', () => {
  it('shows the notice for a new Google user', () => {
    expect(googleReturnView('needs_signup')).toEqual({ kind: 'finish' });
  });

  it('sends an existing user on', () => {
    expect(googleReturnView('logged_in')).toEqual({ kind: 'redirect' });
  });

  it('explains cancel and unavailable accounts', () => {
    expect(googleReturnView('cancelled')).toEqual({ kind: 'message', key: 'cancelled' });
    expect(googleReturnView('account_unavailable')).toEqual({
      kind: 'message',
      key: 'accountUnavailable',
    });
  });

  it('treats anything else as a failure', () => {
    expect(googleReturnView('failed')).toEqual({ kind: 'message', key: 'failed' });
    expect(googleReturnView('linked')).toEqual({ kind: 'message', key: 'failed' });
    expect(googleReturnView(null)).toEqual({ kind: 'message', key: 'failed' });
  });
});
