import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import type { components, paths } from '@/lib/api/generated/schema';

import type { AuditEntry } from './api';
import { AUDIT_ACTIONS } from './filters';

// Feature-local mock of the admin audit endpoints. The shared handler list is
// not ours to edit, so `AuditMocks` adds these to the running worker instead.
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

type AdminUser = components['schemas']['AdminUser'];

const ADMIN_ONE = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
const ADMIN_TWO = '0193a5c2-7b1e-7c3a-9d4f-000000000002';
const ADMIN_GONE = '0193a5c2-7b1e-7c3a-9d4f-000000000012';

const adminUser = (id: string, email: string): AdminUser => ({
  id,
  email,
  sign_in_methods: [],
  organisation: null,
  role: 'admin',
  status: 'active',
  project_count: 0,
  version_count: 0,
  created_at: '2026-01-05T03:00:00Z',
  updated_at: '2026-01-05T03:00:00Z',
});

export const mockAdmins: AdminUser[] = [
  adminUser(ADMIN_ONE, 'admin@cre.ac.th'),
  adminUser(ADMIN_TWO, 'admin2@cre.ac.th'),
];

const targets: Record<string, [string, string]> = {
  user_role_change: ['account', 'user-1042'],
  user_deactivate: ['account', 'user-1187'],
  user_reactivate: ['account', 'user-1187'],
  user_delete: ['account', 'user-1301'],
  advice_edit: ['indicator', 'EC-HS-1'],
  rl_threshold_edit: ['indicator', 'EC-MG-5'],
  impact_table_edit: ['impact_table', 'ri_c'],
  export_request: ['job', '58'],
  export_download: ['job', '58'],
};

const isChange = (action: string) =>
  !['export_request', 'export_download', 'user_deactivate', 'user_reactivate'].includes(action);

function makeEntry(id: number): AuditEntry {
  const action = AUDIT_ACTIONS[id % AUDIT_ACTIONS.length];
  const [target_type, target_id] = targets[action];
  const admin = id % 7 === 0 ? null : id % 2 === 0 ? mockAdmins[0] : mockAdmins[1];
  // Entry 1 is the oldest; ids grow with time, one entry per 7 hours from 1 Oct 2026.
  const occurred = new Date(Date.UTC(2026, 9, 1) + id * 7 * 3_600_000);
  return {
    id,
    occurred_at: occurred.toISOString().replace('.000Z', 'Z'),
    admin_id: admin?.id ?? ADMIN_GONE,
    admin_email: admin?.email ?? null,
    action,
    target_type,
    target_id,
    old_value: isChange(action) ? { level: 'M', note: `ก่อนแก้ไขครั้งที่ ${id}` } : null,
    new_value: isChange(action) ? { level: 'H', note: `หลังแก้ไขครั้งที่ ${id}` } : null,
    request_id: `req-${String(id).padStart(6, '0')}`,
    ip_address: id % 5 === 0 ? null : '203.0.113.24',
  };
}

export const MOCK_ENTRY_COUNT = 47;

/** All mock entries, newest first. */
export const mockEntries: AuditEntry[] = Array.from({ length: MOCK_ENTRY_COUNT }, (_, i) =>
  makeEntry(i + 1),
).reverse();

type Query = URLSearchParams;

export function filterEntries(entries: AuditEntry[], q: Query): AuditEntry[] {
  const admin = q.get('admin_id');
  const action = q.get('action');
  const type = q.get('target_type');
  const targetId = q.get('target_id');
  const from = q.get('from');
  const to = q.get('to');
  return entries.filter(
    (e) =>
      (!admin || e.admin_id === admin) &&
      (!action || e.action === action) &&
      (!type || e.target_type === type) &&
      (!type || !targetId || e.target_id === targetId) &&
      (!from || Date.parse(e.occurred_at) >= Date.parse(from)) &&
      (!to || Date.parse(e.occurred_at) < Date.parse(to)),
  );
}

const summary = ({ old_value, new_value, request_id, ip_address, ...rest }: AuditEntry) => {
  void old_value;
  void new_value;
  void request_id;
  void ip_address;
  return rest;
};

export const auditHandlers: HttpHandler[] = [
  http.get('/admin/audit-log', ({ request, response }) => {
    const q = new URL(request.url).searchParams;
    const page = Math.max(1, Number(q.get('page') ?? 1));
    const pageSize = Math.max(1, Number(q.get('page_size') ?? 20));
    const found = filterEntries(mockEntries, q);
    return response(200).json({
      items: found.slice((page - 1) * pageSize, page * pageSize).map(summary),
      meta: { page, page_size: pageSize, total: found.length },
    });
  }),
  http.get('/admin/audit-log/{audit_id}', ({ params, response }) => {
    const entry = mockEntries.find((e) => e.id === Number(params.audit_id));
    return entry
      ? response(200).json(entry)
      : response(404).json({ error: { code: 'not_found', message: 'audit entry not found' } });
  }),
  http.get('/admin/users', ({ response }) =>
    response(200).json({
      items: mockAdmins,
      meta: { page: 1, page_size: 100, total: mockAdmins.length },
    }),
  ),
];
