import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { browserApi } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/schema';

import type { AuditQuery } from './filters';

export type AuditSummary = components['schemas']['AdminAuditEntrySummary'];
export type AuditEntry = components['schemas']['AdminAuditEntry'];

export const PAGE_SIZE = 20;

/**
 * Entries newest first, one api page per fetch. The contract pages by page
 * number, so "load more" asks for the next page until `total` is reached.
 */
export function useAuditLog(query: AuditQuery | null) {
  return useInfiniteQuery({
    queryKey: ['admin', 'audit', 'list', query],
    enabled: query !== null,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await browserApi().GET('/admin/audit-log', {
        params: { query: { ...query, page: pageParam, page_size: PAGE_SIZE } },
      });
      return data!;
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return last.items.length > 0 && loaded < last.meta.total ? last.meta.page + 1 : undefined;
    },
  });
}

/** One entry with its old and new values, fetched when a row is opened. */
export function useAuditEntry(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'audit', 'one', id],
    enabled,
    queryFn: async () => {
      const { data } = await browserApi().GET('/admin/audit-log/{audit_id}', {
        params: { path: { audit_id: id } },
      });
      return data!;
    },
  });
}

/** Admins offered in the admin filter. */
export function useAuditAdmins() {
  return useQuery({
    queryKey: ['admin', 'audit', 'admins'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await browserApi().GET('/admin/users', {
        params: { query: { role: 'admin', page: 1, page_size: 100 } },
      });
      return data!.items;
    },
  });
}
