import createClient from 'openapi-fetch';

import { CSRF_COOKIE, CSRF_HEADER, readCookie } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/generated/schema';

export type OtpChallenge = components['schemas']['OtpChallenge'];
export type GooglePending = components['schemas']['GooglePending'];
export type RegisterStartBody = components['schemas']['RegisterStartRequest'];
export type GoogleCompleteBody = components['schemas']['GoogleCompleteRequest'];

/**
 * Failed api call with the field codes kept. The shared `ApiError` drops
 * `error.fields`, and the OTP and password errors are told apart by them.
 */
export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** JSON pointer -> field error code, e.g. `/otp` -> `otp_invalid`. */
  readonly fields: Record<string, string>;
  readonly retryAfter?: number;

  constructor(status: number, code: string, fields: Record<string, string>, retryAfter?: number) {
    super(`HTTP ${status} ${code}`);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
  }
}

let memoToken: string | undefined;

const client = createClient<paths>({ baseUrl: '/api/v1', credentials: 'include' });
client.use({
  onRequest({ request }) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const token = readCookie(document.cookie, CSRF_COOKIE) ?? memoToken;
      if (token) request.headers.set(CSRF_HEADER, token);
    }
    return request;
  },
});

type Result<T> = { data?: T; error?: unknown; response: Response };

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

/** Fetches the CSRF cookie once; later unsafe calls echo it in the header. */
export async function ensureCsrf(): Promise<void> {
  if (memoToken || readCookie(document.cookie, CSRF_COOKIE)) return;
  const data = unwrap(await client.GET('/auth/csrf'));
  memoToken = data.csrf_token;
}

export async function startRegistration(body: RegisterStartBody): Promise<OtpChallenge> {
  await ensureCsrf();
  return unwrap(await client.POST('/auth/register/start', { body }));
}

export async function verifyRegistration(email: string, otp: string) {
  await ensureCsrf();
  return unwrap(await client.POST('/auth/register/verify', { body: { email, otp } }));
}

export async function resendRegistrationOtp(email: string): Promise<OtpChallenge> {
  await ensureCsrf();
  return unwrap(await client.POST('/auth/register/resend', { body: { email } }));
}

export async function startGoogleSignup(): Promise<string> {
  await ensureCsrf();
  const data = unwrap(await client.POST('/auth/google/start', { body: { intent: 'signup' } }));
  return data.authorization_url;
}

export async function getGooglePending(): Promise<GooglePending> {
  return unwrap(await client.GET('/auth/google/pending'));
}

export async function completeGoogleSignup(body: GoogleCompleteBody) {
  await ensureCsrf();
  return unwrap(await client.POST('/auth/google/complete', { body }));
}
