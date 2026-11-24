import { notFound, redirect } from 'next/navigation';

import { ApiError } from '@/lib/api/errors';
import type { components } from '@/lib/api/generated/schema';
import { serverApi } from '@/lib/api/server';

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

/** Server-side guard for the `(app)` and `(admin)` layouts. */
export async function requireSession(options: { requireAdmin: boolean }): Promise<AuthSession> {
  const api = await serverApi();
  const result = await evaluateGuard(async () => {
    const { data } = await api.GET('/auth/me');
    if (!data) throw new ApiError(500, 'unknown', 'empty session answer');
    return data;
  }, options);
  return enforceGuard(result);
}
