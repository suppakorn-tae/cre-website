import type { ApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';

/**
 * Ends the session. An expired session (401) already counts as logged out,
 * so it resolves; any other failure is rethrown.
 */
export async function signOut(api: Pick<ApiClient, 'POST'>): Promise<void> {
  try {
    await api.POST('/auth/logout');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    throw error;
  }
}
