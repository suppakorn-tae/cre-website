import { describe, expect, it } from 'vitest';

import {
  canUnlinkGoogle,
  classifyDeleteFailure,
  classifyPasswordFailure,
  classifyUnlinkFailure,
  organisationError,
  resultNotice,
  validatePasswordChange,
  waitParts,
} from './account';

const failure = (status: number, code = 'unknown', fields: Record<string, string> = {}) => ({
  status,
  code,
  fields,
});

describe('validatePasswordChange', () => {
  it('accepts a matching new password of 8 or more characters', () => {
    expect(
      validatePasswordChange({
        current: 'x',
        next: 'รหัสผ่านใหม่-2569',
        confirmation: 'รหัสผ่านใหม่-2569',
      }),
    ).toEqual({});
  });

  it('flags empty current, short new and mismatching confirmation', () => {
    expect(validatePasswordChange({ current: '', next: 'short', confirmation: 'other' })).toEqual({
      current: 'currentRequired',
      next: 'tooShort',
      confirmation: 'mismatch',
    });
  });

  it('counts Thai characters as one each', () => {
    expect(
      validatePasswordChange({ current: 'x', next: 'กขคงจฉชซ', confirmation: 'กขคงจฉชซ' }),
    ).toEqual({});
  });

  it('asks for the confirmation when empty and rejects over 128', () => {
    const long = 'a'.repeat(129);
    expect(validatePasswordChange({ current: 'x', next: long, confirmation: '' })).toEqual({
      next: 'tooLong',
      confirmation: 'confirmationRequired',
    });
  });
});

describe('classifyPasswordFailure', () => {
  it('maps the 422 field codes of the contract', () => {
    expect(
      classifyPasswordFailure(
        failure(422, 'validation_failed', { '/current_password': 'current_password_incorrect' }),
      ),
    ).toEqual({ kind: 'fields', errors: { current: 'currentIncorrect' } });
    expect(
      classifyPasswordFailure(
        failure(422, 'validation_failed', { '/new_password': 'password_too_short' }),
      ),
    ).toEqual({ kind: 'fields', errors: { next: 'tooShort' } });
  });

  it('handles no_password, rate limit and everything else', () => {
    expect(classifyPasswordFailure(failure(409, 'no_password'))).toEqual({ kind: 'no_password' });
    expect(classifyPasswordFailure({ ...failure(429), retryAfter: 30 })).toEqual({
      kind: 'rate_limited',
      retryAfter: 30,
    });
    expect(classifyPasswordFailure(failure(500))).toEqual({ kind: 'other' });
    expect(classifyPasswordFailure(failure(422, 'validation_failed', { '/x': 'y' }))).toEqual({
      kind: 'other',
    });
  });
});

describe('delete and unlink failures', () => {
  it('tells a wrong password from a missing Google re-authentication', () => {
    expect(
      classifyDeleteFailure(
        failure(422, 'validation_failed', { '/current_password': 'current_password_incorrect' }),
      ),
    ).toBe('passwordIncorrect');
    expect(classifyDeleteFailure(failure(403, 'reauth_required'))).toBe('reauthRequired');
    expect(classifyDeleteFailure(failure(429))).toBe('rate_limited');
    expect(classifyDeleteFailure(failure(500))).toBe('other');
  });

  it('maps password_required on unlink', () => {
    expect(classifyUnlinkFailure(failure(409, 'password_required'))).toBe('passwordRequired');
    expect(classifyUnlinkFailure(failure(409, 'google_not_linked'))).toBe('other');
  });
});

describe('canUnlinkGoogle', () => {
  it('needs both a linked Google and a password', () => {
    expect(canUnlinkGoogle({ password: true, google: true })).toBe(true);
    expect(canUnlinkGoogle({ password: false, google: true })).toBe(false);
    expect(canUnlinkGoogle({ password: true, google: false })).toBe(false);
  });
});

describe('resultNotice', () => {
  it('maps the callback results the account page handles', () => {
    expect(resultNotice('linked')).toEqual({ tone: 'success', key: 'linked' });
    expect(resultNotice('reauthenticated')).toEqual({ tone: 'success', key: 'reauthenticated' });
    expect(resultNotice('already_linked')).toEqual({ tone: 'error', key: 'alreadyLinked' });
    expect(resultNotice('failed')).toEqual({ tone: 'error', key: 'failed' });
  });

  it('ignores log-in results and nothing', () => {
    expect(resultNotice('logged_in')).toBeNull();
    expect(resultNotice(null)).toBeNull();
  });
});

describe('organisationError and waitParts', () => {
  it('limits the organisation to 200 characters', () => {
    expect(organisationError('ก'.repeat(200))).toBeUndefined();
    expect(organisationError('ก'.repeat(201))).toBe('tooLong');
  });

  it('rounds long waits to minutes', () => {
    expect(waitParts(30)).toEqual({ unit: 'seconds', value: 30 });
    expect(waitParts(600)).toEqual({ unit: 'minutes', value: 10 });
    expect(waitParts(undefined)).toEqual({ unit: 'unknown', value: 0 });
  });
});
