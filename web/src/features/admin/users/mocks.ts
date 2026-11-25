import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import type { paths } from '@/lib/api/generated/schema';

import type { AdminUser, UserRole } from './api';

// Feature-local mock of the admin users api. The shared handler list is not
// ours to edit, so `AdminUserMocks` adds these to the running worker.
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

const idFor = (n: number) => `0193a5c2-7b1e-7c3a-9d4f-${String(n).padStart(12, '0')}`;

/** The signed-in admin of the mocks: row 1, shown as "(คุณ)". */
export const ownAdminId = idFor(1);

type Seed = Pick<AdminUser, 'email' | 'organisation' | 'role' | 'status' | 'sign_in_methods'> &
  Pick<AdminUser, 'project_count' | 'version_count'>;

const seeds: Seed[] = [
  {
    email: 'admin@cre.ac.th',
    organisation: 'มหาวิทยาลัยทักษิณ',
    role: 'admin',
    status: 'active',
    sign_in_methods: ['password'],
    project_count: 0,
    version_count: 0,
  },
  {
    email: 'assessor@company.co.th',
    organisation: 'บ. ก่อสร้างเกาะ จำกัด',
    role: 'user',
    status: 'active',
    sign_in_methods: ['password', 'google'],
    project_count: 3,
    version_count: 7,
  },
  {
    email: 'site.eng@samui-build.co.th',
    organisation: 'Samui Build',
    role: 'user',
    status: 'active',
    sign_in_methods: ['google'],
    project_count: 2,
    version_count: 3,
  },
  {
    email: 'pm.lanta@gmail.com',
    organisation: null,
    role: 'user',
    status: 'deactivated',
    sign_in_methods: ['password'],
    project_count: 1,
    version_count: 1,
  },
  {
    email: null,
    organisation: null,
    role: 'user',
    status: 'deleted',
    sign_in_methods: [],
    project_count: 2,
    version_count: 4,
  },
  {
    email: 'admin2@cre.ac.th',
    organisation: 'มหาวิทยาลัยทักษิณ',
    role: 'admin',
    status: 'active',
    sign_in_methods: ['password'],
    project_count: 0,
    version_count: 0,
  },
];

const orgs = ['บริษัท เกาะเต่าก่อสร้าง', 'กรมเจ้าท่า', 'องค์การบริหารส่วนตำบลเกาะพะงัน', null];

function seedUsers(): AdminUser[] {
  const all: Seed[] = [...seeds];
  for (let i = 0; i < 20; i += 1) {
    all.push({
      email: `engineer${String(i + 1).padStart(2, '0')}@example.co.th`,
      organisation: orgs[i % orgs.length],
      role: 'user',
      status: i % 9 === 4 ? 'deactivated' : 'active',
      sign_in_methods: i % 3 === 0 ? ['google'] : ['password'],
      project_count: i % 4,
      version_count: (i * 3) % 7,
    });
  }
  return all
    .map((s, i) => ({
      ...s,
      id: idFor(i + 1),
      created_at: new Date(Date.UTC(2026, 9, 2 + i, 3, 14, 7)).toISOString(),
      updated_at: new Date(Date.UTC(2026, 9, 2 + i, 3, 14, 7)).toISOString(),
    }))
    .reverse();
}

let store: AdminUser[] = seedUsers();

/** Resets the in-memory store to the seed (newest first). Used by tests. */
export function resetAdminUserStore(): void {
  store = seedUsers();
}

export function getAdminUserStore(): AdminUser[] {
  return store;
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

export function searchAdminUsers(
  items: AdminUser[],
  { q = '', role = '', status = '' }: { q?: string; role?: string; status?: string },
): AdminUser[] {
  const needle = q.trim().toLowerCase();
  return items.filter(
    (u) =>
      (!role || u.role === role) &&
      (!status || u.status === status) &&
      (!needle ||
        [u.email ?? '', u.organisation ?? ''].some((text) => text.toLowerCase().includes(needle))),
  );
}

function update(id: string, change: (u: AdminUser) => AdminUser): AdminUser | undefined {
  const current = store.find((u) => u.id === id);
  if (!current) return undefined;
  const next = { ...change(current), updated_at: new Date().toISOString() };
  store = store.map((u) => (u.id === id ? next : u));
  return next;
}

const activeAdmins = () => store.filter((u) => u.role === 'admin' && u.status === 'active');

export const adminUserHandlers: HttpHandler[] = [
  // The admin area is only reachable by an admin, so the mocks sign in as one.
  http.get('/auth/me', ({ response }) =>
    response(200).json({
      user: {
        id: ownAdminId,
        email: 'admin@cre.ac.th',
        role: 'admin',
        organisation: 'มหาวิทยาลัยทักษิณ',
        sign_in_methods: { password: true, google: false },
        terms_accepted_at: '2026-10-02T03:14:07Z',
        created_at: '2026-10-02T03:14:07Z',
      },
      expires_at: '2026-12-20T03:14:07Z',
      keep_logged_in: true,
    }),
  ),
  http.get('/admin/users', ({ request, response }) => {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.max(1, Number(url.searchParams.get('page_size') ?? 20));
    const found = searchAdminUsers(store, {
      q: url.searchParams.get('q') ?? '',
      role: url.searchParams.get('role') ?? '',
      status: url.searchParams.get('status') ?? '',
    });
    return response(200).json({
      items: found.slice((page - 1) * pageSize, page * pageSize),
      meta: { page, page_size: pageSize, total: found.length },
    });
  }),
  http.get('/admin/users/{user_id}', ({ params, response }) => {
    const user = store.find((u) => u.id === params.user_id);
    return user
      ? response(200).json(user)
      : response(404).json(errorBody('not_found', 'user not found'));
  }),
  http.put('/admin/users/{user_id}/role', async ({ params, request, response }) => {
    const id = String(params.user_id);
    const { role } = (await request.clone().json()) as { role: UserRole };
    const current = store.find((u) => u.id === id);
    if (!current) return response(404).json(errorBody('not_found', 'user not found'));
    if (id === ownAdminId) return response(409).json(errorBody('own_account', 'own account'));
    if (current.role === 'admin' && role !== 'admin' && activeAdmins().length <= 1) {
      return response(409).json(errorBody('last_admin', 'last admin'));
    }
    return response(200).json(update(id, (u) => ({ ...u, role }))!);
  }),
  http.post('/admin/users/{user_id}/deactivate', ({ params, response }) => {
    const id = String(params.user_id);
    const current = store.find((u) => u.id === id);
    if (!current) return response(404).json(errorBody('not_found', 'user not found'));
    if (id === ownAdminId) return response(409).json(errorBody('own_account', 'own account'));
    if (current.status !== 'active') return response(409).json(errorBody('conflict', 'not active'));
    if (current.role === 'admin' && activeAdmins().length <= 1) {
      return response(409).json(errorBody('last_admin', 'last admin'));
    }
    return response(200).json(update(id, (u) => ({ ...u, status: 'deactivated' }))!);
  }),
  http.post('/admin/users/{user_id}/reactivate', ({ params, response }) => {
    const id = String(params.user_id);
    const current = store.find((u) => u.id === id);
    if (!current) return response(404).json(errorBody('not_found', 'user not found'));
    if (current.status !== 'deactivated') {
      return response(409).json(errorBody('conflict', 'not deactivated'));
    }
    return response(200).json(update(id, (u) => ({ ...u, status: 'active' }))!);
  }),
  http.delete('/admin/users/{user_id}', ({ params, response }) => {
    const id = String(params.user_id);
    const current = store.find((u) => u.id === id);
    if (!current) return response(404).json(errorBody('not_found', 'user not found'));
    if (id === ownAdminId) return response(409).json(errorBody('own_account', 'own account'));
    if (current.role === 'admin' && current.status === 'active' && activeAdmins().length <= 1) {
      return response(409).json(errorBody('last_admin', 'last admin'));
    }
    update(id, (u) => ({
      ...u,
      email: null,
      organisation: null,
      sign_in_methods: [],
      status: 'deleted',
    }));
    return response(204).empty();
  }),
];
