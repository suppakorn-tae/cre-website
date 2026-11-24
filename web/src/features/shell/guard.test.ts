import { HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createOpenApiHttp } from 'openapi-msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { paths } from '@/lib/api/generated/schema';
import { authHandlers, mockAccount, mockAuthSession } from '@/mocks/auth';

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/api/server', () => ({ serverApi: vi.fn() }));

import { enforceGuard, evaluateGuard } from './guard';

const base = 'http://test.local/api/v1';
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });
const server = setupServer(...authHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createApiClient({ baseUrl: base, fetch: (input, init) => fetch(input, init) });
async function fetchSession() {
  const { data } = await api.GET('/auth/me');
  if (!data) throw new Error('no data');
  return data;
}

const unauthorized = () =>
  http.get('/auth/me', ({ response }) =>
    response(401).json({ error: { code: 'unauthorized', message: 'no session' } }),
  );
const asRole = (role: 'user' | 'admin') =>
  http.get('/auth/me', ({ response }) =>
    response(200).json({ ...mockAuthSession, user: { ...mockAccount, role } }),
  );

describe('auth guard', () => {
  it('redirects to log-in when the api answers 401', async () => {
    server.use(unauthorized());
    const result = await evaluateGuard(fetchSession, { requireAdmin: false });
    expect(result).toEqual({ status: 'unauthenticated' });
    expect(() => enforceGuard(result)).toThrow('REDIRECT:/login');
  });

  it('redirects on (admin) too when there is no session', async () => {
    server.use(unauthorized());
    const result = await evaluateGuard(fetchSession, { requireAdmin: true });
    expect(() => enforceGuard(result)).toThrow('REDIRECT:/login');
  });

  it('lets a signed-in user into (app)', async () => {
    const result = await evaluateGuard(fetchSession, { requireAdmin: false });
    expect(enforceGuard(result).user.email).toBe(mockAccount.email);
  });

  it('returns 404 for a non-admin on (admin)', async () => {
    server.use(asRole('user'));
    const result = await evaluateGuard(fetchSession, { requireAdmin: true });
    expect(result).toEqual({ status: 'forbidden' });
    expect(() => enforceGuard(result)).toThrow('NOT_FOUND');
  });

  it('lets an admin into (admin)', async () => {
    server.use(asRole('admin'));
    const result = await evaluateGuard(fetchSession, { requireAdmin: true });
    expect(result.status).toBe('ok');
  });

  it('does not sign the user out on a server error', async () => {
    server.use(
      http.get('/auth/me', () =>
        HttpResponse.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    );
    await expect(evaluateGuard(fetchSession, { requireAdmin: false })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
