import { cookies } from 'next/headers';

import { CSRF_COOKIE, SERVER_BASE_URL, createApiClient, type ApiClient } from './client';

/**
 * Client for server components and actions: calls the api container directly
 * and forwards the visitor's cookies (session JWT + CSRF token).
 */
export async function serverApi(): Promise<ApiClient> {
  const jar = await cookies();
  return createApiClient({
    baseUrl: process.env.API_INTERNAL_URL ?? SERVER_BASE_URL,
    headers: { Cookie: jar.toString() },
    getCsrfToken: () => jar.get(CSRF_COOKIE)?.value,
  });
}
