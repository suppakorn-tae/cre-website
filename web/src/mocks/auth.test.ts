import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authHandlers, mockAccount, mockOtp } from './auth';

const server = setupServer(...authHandlers);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

const base = 'http://localhost/api/v1';
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('auth mocks', () => {
  it('returns the Thai sample session', async () => {
    const res = await fetch(`${base}/auth/me`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.organisation).toBe(mockAccount.organisation);
    expect(body.user.organisation).toMatch(/[฀-๿]/);
  });

  it('rejects a wrong OTP with a 422 field error', async () => {
    const res = await fetch(
      `${base}/auth/register/verify`,
      json({ email: 'new@example.co.th', otp: '000000' }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.fields[0]).toEqual({ field: '/otp', code: 'otp_invalid' });
  });

  it('creates the account with the right OTP', async () => {
    const res = await fetch(
      `${base}/auth/register/verify`,
      json({ email: 'new@example.co.th', otp: mockOtp }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).user.email).toBe('new@example.co.th');
  });

  it('gives a generic 401 for bad credentials', async () => {
    const res = await fetch(
      `${base}/auth/login`,
      json({ email: 'x@example.co.th', password: 'abcdefgh' }),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('invalid_credentials');
  });
});
