import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';

import { ApiError } from '@/lib/api/errors';
import type { components } from '@/lib/api/generated/schema';
import { serverApi } from '@/lib/api/server';
import { assertNoMocksInProduction, isMockMode, mockRole } from '@/lib/mocks/mock-mode';

import type { ShellVariant } from './AppShell';
import { LOGIN_PATH } from './login-path';

export type AuthSession = components['schemas']['AuthSession'];

export type GuardResult =
  { status: 'ok'; session: AuthSession } | { status: 'unauthenticated' } | { status: 'forbidden' };

/**
 * Decides what to do with a request from the answer of `GET /auth/me`.
 * A 401 means no (or an expired) session. Any other failure is rethrown so
 * the error boundary shows it instead of wrongly signing the user out.
 */
export async function evaluateGuard(
  fetchSession: () => Promise<AuthSession>,
  { requireAdmin }: { requireAdmin: boolean },
): Promise<GuardResult> {
  let session: AuthSession;
  try {
    session = await fetchSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { status: 'unauthenticated' };
    throw error;
  }
  if (requireAdmin && session.user.role !== 'admin') return { status: 'forbidden' };
  return { status: 'ok', session };
}

/** Turns a guard result into a redirect or a 404, or returns the session. */
export function enforceGuard(result: GuardResult): AuthSession {
  if (result.status === 'unauthenticated') redirect(LOGIN_PATH);
  // A non-admin gets the same 404 as an unknown page, so the admin area
  // does not reveal that it exists.
  if (result.status === 'forbidden') notFound();
  return result.session;
}

/** The session of mock mode: the sample user, or the admin with `CRE_MOCK_ROLE=admin`. */
export async function mockSession(): Promise<AuthSession> {
  const { mockAdminSession, mockAuthSession } = await import('@/mocks/auth');
  return mockRole() === 'admin' ? mockAdminSession : mockAuthSession;
}

/** Server-side guard for the `(app)` and `(admin)` layouts. */
export async function requireSession(options: { requireAdmin: boolean }): Promise<AuthSession> {
  // The session is per request: opt out of prerendering before fetching,
  // otherwise Next flags the fetch's random values during prerender.
  await connection();
  // Mock mode has no api for the server to ask (MSW runs in the browser only),
  // so the mock session stands in. A production server refuses it.
  assertNoMocksInProduction();
  if (isMockMode()) return enforceGuard(await evaluateGuard(mockSession, options));
  const api = await serverApi();
  const result = await evaluateGuard(async () => {
    const { data } = await api.GET('/auth/me');
    if (!data) throw new ApiError(500, 'unknown', 'empty session answer');
    return data;
  }, options);
  return enforceGuard(result);
}

/**
 * One session check per request, shared by everything that needs the session:
 * the account control, the guard and the page title. Share this, not
 * `requireSession`, so a second reader does not call `/auth/me` again.
 */
export const sessionFor = cache((variant: ShellVariant) =>
  requireSession({ requireAdmin: variant === 'admin' }),
);
