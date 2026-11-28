import { cookies } from 'next/headers';

import {
  CSRF_COOKIES,
  SESSION_COOKIES,
  SERVER_BASE_URL,
  createApiClient,
  type ApiClient,
} from './client';

/**
 * Client for server components and actions: calls the api container directly
 * and forwards only the session and CSRF cookies (both the `__Host-` and the
 * development names; the api reads the one of its environment).
 */
export async function serverApi(): Promise<ApiClient> {
  const jar = await cookies();
  return createApiClient({
    baseUrl: process.env.API_INTERNAL_URL ?? SERVER_BASE_URL,
    headers: {
      Cookie: [...SESSION_COOKIES, ...CSRF_COOKIES]
        .flatMap((name) => {
          const cookie = jar.get(name);
          return cookie ? [`${name}=${encodeURIComponent(cookie.value)}`] : [];
        })
        .join('; '),
    },
    getCsrfToken: () => CSRF_COOKIES.map((name) => jar.get(name)?.value).find(Boolean),
  });
}
