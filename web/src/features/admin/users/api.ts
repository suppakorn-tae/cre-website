import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { components } from '@/lib/api/generated/schema';

export type AdminUser = components['schemas']['AdminUser'];
export type UserRole = components['schemas']['UserRole'];
export type AccountStatus = components['schemas']['AccountStatus'];

export const PAGE_SIZE = 10;

export type UserFilters = { q: string; role: UserRole | ''; status: AccountStatus | '' };

const keys = {
  all: ['admin-users'] as const,
  list: (f: UserFilters, page: number) => ['admin-users', 'list', f, page] as const,
  one: (id: string) => ['admin-users', 'one', id] as const,
  me: ['admin-users', 'me'] as const,
};

/** One page of users, newest first. Counts only, never their projects. */
export function useAdminUsers(filters: UserFilters, page: number) {
  return useQuery({
    queryKey: keys.list(filters, page),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await browserApi().GET('/admin/users', {
        params: {
          query: {
            q: filters.q || undefined,
            role: filters.role || undefined,
            status: filters.status || undefined,
            page,
            page_size: PAGE_SIZE,
          },
        },
      });
      return data!;
    },
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: keys.one(id),
    retry: false,
    queryFn: async () => {
      const { data } = await browserApi().GET('/admin/users/{user_id}', {
        params: { path: { user_id: id } },
      });
      return data!;
    },
  });
}

/** Id of the signed-in admin, to disable actions on their own account. */
export function useOwnUserId() {
  return useQuery({
    queryKey: keys.me,
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await browserApi().GET('/auth/me');
      return data!.user.id;
    },
  });
}

export type UserAction =
  | { kind: 'role'; role: UserRole }
  | { kind: 'deactivate' }
  | { kind: 'reactivate' }
  | { kind: 'delete' };

/** One admin action on one user. Refreshes every users query afterwards. */
export function useUserAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: UserAction) => {
      const api = browserApi();
      const params = { path: { user_id: id } };
      switch (action.kind) {
        case 'role':
          await api.PUT('/admin/users/{user_id}/role', { params, body: { role: action.role } });
          break;
        case 'deactivate':
          await api.POST('/admin/users/{user_id}/deactivate', { params });
          break;
        case 'reactivate':
          await api.POST('/admin/users/{user_id}/reactivate', { params });
          break;
        case 'delete':
          await api.DELETE('/admin/users/{user_id}', { params });
          break;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export type ActionErrorKey = 'ownAccount' | 'lastAdmin' | 'conflict' | 'notFound' | 'generic';

/** Maps a failed action to a key of `admin-users.errors`. */
export function actionErrorKey(error: unknown): ActionErrorKey {
  if (!(error instanceof ApiError)) return 'generic';
  if (error.status === 409) {
    if (error.code === 'own_account') return 'ownAccount';
    if (error.code === 'last_admin') return 'lastAdmin';
    return 'conflict';
  }
  if (error.status === 404) return 'notFound';
  return 'generic';
}

/** Sign-in methods in a stable order: password first, then Google. */
export function orderedMethods(
  methods: AdminUser['sign_in_methods'],
): AdminUser['sign_in_methods'] {
  return (['password', 'google'] as const).filter((m) => methods.includes(m));
}
