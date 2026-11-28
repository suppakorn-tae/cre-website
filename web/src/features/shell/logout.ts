import type { QueryClient } from '@tanstack/react-query';

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

function tabStorage(): Pick<Storage, 'clear'> | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined; // storage blocked
  }
}

/**
 * Drops what a signed-in user left in this tab: the cached API data and the
 * tab's session storage. Call it after log out and before a new sign-in
 * shows any page, so one user never sees another user's data. The theme
 * choice (local storage) is a browser setting and stays.
 */
export function clearClientData(
  queryClient: Pick<QueryClient, 'clear'>,
  storage: Pick<Storage, 'clear'> | undefined = tabStorage(),
): void {
  queryClient.clear();
  try {
    storage?.clear();
  } catch {
    // Storage can be blocked; there is then nothing to clear.
  }
}
