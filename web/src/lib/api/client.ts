import createClient, { type Middleware } from 'openapi-fetch';

import { ApiError } from './errors';
import type { paths } from './generated/schema';

export const BROWSER_BASE_URL = '/api/v1';
export const SERVER_BASE_URL = 'http://api:4000/api/v1';

/** Header named by the contract (`csrfToken` security scheme). */
export const CSRF_HEADER = 'X-CSRF-Token';
/**
 * Session cookie named by the contract (`sessionCookie` security scheme), by
 * preference. Production uses the `__Host-` name; local http development
 * drops the prefix, because browsers reject a `__Host-` cookie that is not
 * Secure. The api reads only the name of its own environment.
 */
export const SESSION_COOKIES = ['__Host-cre_session', 'cre_session'] as const;
/** Cookie the api sets with the CSRF token (double-submit); readable by script. Same naming. */
export const CSRF_COOKIES = ['__Host-cre_csrf', 'cre_csrf'] as const;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the CSRF token for mutations, if known. */
  getCsrfToken?: () => string | undefined;
  /** Extra headers on every request, e.g. the forwarded auth cookie. */
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * The CSRF token from the browser's cookies. Over https (production) only the
 * `__Host-` cookie counts: an unprefixed `cre_csrf` left from before the
 * rename, or planted by a sibling subdomain, would fail the api's check.
 * Over plain http (local development) the api sets the unprefixed name.
 */
export function readCsrfCookie(
  cookieHeader: string,
  https = globalThis.location?.protocol === 'https:',
): string | undefined {
  return readCookie(cookieHeader, https ? CSRF_COOKIES[0] : CSRF_COOKIES[1]);
}

/** Turns non-2xx answers into ApiError so TanStack Query can handle them. */
const throwOnError: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return undefined;
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      // non-JSON error body
    }
    throw ApiError.fromBody(response.status, body);
  },
};

export function createApiClient(options: ApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.headers,
    fetch: options.fetch,
    credentials: 'include',
  });
  client.use({
    onRequest({ request }) {
      if (!SAFE_METHODS.has(request.method.toUpperCase())) {
        const token = options.getCsrfToken?.();
        if (token) request.headers.set(CSRF_HEADER, token);
      }
      return request;
    },
  });
  client.use(throwOnError);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

let browserClient: ApiClient | undefined;

/** Browser client: relative `/api/v1`, CSRF token read from its cookie. */
export function browserApi(): ApiClient {
  browserClient ??= createApiClient({
    baseUrl: BROWSER_BASE_URL,
    getCsrfToken: () => readCsrfCookie(document.cookie),
  });
  return browserClient;
}
