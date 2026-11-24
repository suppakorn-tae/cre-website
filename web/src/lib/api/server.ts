import { cookies } from 'next/headers';

import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SERVER_BASE_URL,
  createApiClient,
  type ApiClient,
} from './client';

/**
 * Client for server components and actions: calls the api container directly
 * and forwards only the session and CSRF cookies.
 */
export async function serverApi(): Promise<ApiClient> {
  const jar = await cookies();
  return createApiClient({
    baseUrl: process.env.API_INTERNAL_URL ?? SERVER_BASE_URL,
    headers: {
      Cookie: [SESSION_COOKIE, CSRF_COOKIE]
        .flatMap((name) => {
          const cookie = jar.get(name);
          return cookie ? [`${name}=${encodeURIComponent(cookie.value)}`] : [];
        })
        .join('; '),
    },
    getCsrfToken: () => jar.get(CSRF_COOKIE)?.value,
  });
}
