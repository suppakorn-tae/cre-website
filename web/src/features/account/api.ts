import createClient, { type Client } from 'openapi-fetch';

import { AuthApiError, ensureCsrf } from '@/features/auth/register/api';
import { CSRF_HEADER, readCsrfCookie } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/generated/schema';

export type Account = components['schemas']['Account'];
export type ChangePasswordBody = components['schemas']['ChangePasswordRequest'];

export { AuthApiError };

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Same shape as the auth api: keeps field codes and `Retry-After`. */
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

/** Calls of the account page. `prepare` runs before each unsafe call (CSRF). */
export function createAccountApi(client: Client<paths>, prepare: () => Promise<void>) {
  return {
    async get(): Promise<Account> {
      return unwrap(await client.GET('/account'));
    },
    async updateOrganisation(organisation: string): Promise<Account> {
      await prepare();
      return unwrap(await client.PATCH('/account', { body: { organisation } }));
    },
    async changePassword(body: ChangePasswordBody): Promise<void> {
      await prepare();
      unwrap(await client.PUT('/account/password', { body }));
    },
    async unlinkGoogle(): Promise<Account> {
      await prepare();
      return unwrap(await client.DELETE('/account/google'));
    },
    /** Pass the password, or nothing after a Google re-authentication. */
    async deleteAccount(currentPassword?: string): Promise<void> {
      await prepare();
      unwrap(
        await client.DELETE('/account', {
          body: currentPassword === undefined ? {} : { current_password: currentPassword },
        }),
      );
    },
    /** Returns the Google URL to navigate to; the callback comes back with `?result=`. */
    async startGoogle(intent: 'link' | 'reauth'): Promise<string> {
      await prepare();
      return unwrap(await client.POST('/auth/google/start', { body: { intent } }))
        .authorization_url;
    },
  };
}

function browserClient() {
  const client = createClient<paths>({ baseUrl: '/api/v1', credentials: 'include' });
  client.use({
    onRequest({ request }) {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const token = readCsrfCookie(document.cookie);
        if (token) request.headers.set(CSRF_HEADER, token);
      }
      return request;
    },
  });
  return client;
}

export const accountApi = createAccountApi(browserClient(), ensureCsrf);
