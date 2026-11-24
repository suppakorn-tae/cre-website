import createClient, { type Middleware } from 'openapi-fetch';

import { ApiError } from './errors';
import type { paths } from './generated/schema';

export const BROWSER_BASE_URL = '/api/v1';
export const SERVER_BASE_URL = 'http://api:4000/api/v1';

/** Header named by the contract (`csrfToken` security scheme). */
export const CSRF_HEADER = 'X-CSRF-Token';
/** Cookie the api sets with the CSRF token (double-submit); readable by script. */
export const CSRF_COOKIE = 'cre_csrf';

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
    getCsrfToken: () => readCookie(document.cookie, CSRF_COOKIE),
  });
  return browserClient;
}
