import createClient from 'openapi-fetch';

import { AuthApiError, ensureCsrf, refreshCsrf } from '@/features/auth/register/api';
import { CSRF_COOKIE, CSRF_HEADER, readCookie } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/generated/schema';

export type OtpChallenge = components['schemas']['OtpChallenge'];
export type LoginBody = components['schemas']['LoginRequest'];
export type ResetBody = components['schemas']['ResetPasswordRequest'];

export { AuthApiError, refreshCsrf };

const client = createClient<paths>({ baseUrl: '/api/v1', credentials: 'include' });
client.use({
  onRequest({ request }) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const token = readCookie(document.cookie, CSRF_COOKIE);
      if (token) request.headers.set(CSRF_HEADER, token);
    }
    return request;
  },
});

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Same shape as the sign-up api: keeps field codes and `Retry-After`. */
function unwrap<T>({ data, error, response }: Result<T>): T {
  if (response.ok) return data as T;
  const body = (error as { error?: { code?: string; fields?: { field: string; code: string }[] } })
    ?.error;
  const fields: Record<string, string> = {};
  for (const f of body?.fields ?? []) fields[f.field] = f.code;
  const retry = Number(response.headers.get('Retry-After'));
  throw new AuthApiError(
    response.status,
    body?.code ?? 'unknown',
    fields,
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
  );
}

export async function login(body: LoginBody) {
  await ensureCsrf();
  return unwrap(await client.POST('/auth/login', { body }));
}

export async function startGoogleLogin(): Promise<string> {
  await ensureCsrf();
  const data = unwrap(await client.POST('/auth/google/start', { body: { intent: 'login' } }));
  return data.authorization_url;
}

/** Always answers the same, whether or not the e-mail is registered. */
export async function requestPasswordReset(email: string): Promise<OtpChallenge> {
  await ensureCsrf();
  return unwrap(await client.POST('/auth/password/forgot', { body: { email } }));
}

export async function resetPassword(body: ResetBody): Promise<void> {
  await ensureCsrf();
  unwrap(await client.POST('/auth/password/reset', { body }));
}
