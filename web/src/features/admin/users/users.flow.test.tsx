import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import adminUsers from '../../../../messages/th/admin-users.json';
import { ApiError } from '@/lib/api/errors';
import { createApiClient } from '@/lib/api/client';

import { actionErrorKey } from './api';
import {
  adminUserHandlers,
  getAdminUserStore,
  ownAdminId,
  resetAdminUserStore,
  searchAdminUsers,
} from './mocks';
import { RoleBadge, StatusBadge } from './UserBadges';

const server = setupServer(...adminUserHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => resetAdminUserStore());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createApiClient({
  baseUrl: 'http://localhost/api/v1',
  fetch: (request) => fetch(request),
});

const byEmail = (email: string) => getAdminUserStore().find((u) => u.email === email)!;
const params = (id: string) => ({ params: { path: { user_id: id } } });

describe('admin users against the MSW mocks', () => {
  it('lists newest first with counts and filters by search, role and status', async () => {
    const all = await api.GET('/admin/users', { params: { query: { page: 1, page_size: 10 } } });
    expect(all.data!.meta.total).toBe(getAdminUserStore().length);
    expect(all.data!.items).toHaveLength(10);

    const admins = await api.GET('/admin/users', { params: { query: { role: 'admin' } } });
    expect(admins.data!.items.every((u) => u.role === 'admin')).toBe(true);

    const stopped = await api.GET('/admin/users', { params: { query: { status: 'deactivated' } } });
    expect(stopped.data!.items.length).toBeGreaterThan(0);

    const found = await api.GET('/admin/users', { params: { query: { q: 'SAMUI' } } });
    expect(found.data!.items.map((u) => u.email)).toEqual(['site.eng@samui-build.co.th']);
    expect(searchAdminUsers(getAdminUserStore(), { q: 'ไม่มีผู้ใช้นี้' })).toHaveLength(0);
  });

  it('changes a role, then deactivates and reactivates an account', async () => {
    const { id } = byEmail('assessor@company.co.th');

    const promoted = await api.PUT('/admin/users/{user_id}/role', {
      ...params(id),
      body: { role: 'admin' },
    });
    expect(promoted.data!.role).toBe('admin');

    const stopped = await api.POST('/admin/users/{user_id}/deactivate', params(id));
    expect(stopped.data!.status).toBe('deactivated');
    expect((await api.GET('/admin/users/{user_id}', params(id))).data!.status).toBe('deactivated');

    const back = await api.POST('/admin/users/{user_id}/reactivate', params(id));
    expect(back.data!.status).toBe('active');
  });

  it('deletes by anonymising and keeps the counts', async () => {
    const user = byEmail('site.eng@samui-build.co.th');
    await api.DELETE('/admin/users/{user_id}', params(user.id));
    const after = (await api.GET('/admin/users/{user_id}', params(user.id))).data!;
    expect(after).toMatchObject({ email: null, status: 'deleted', sign_in_methods: [] });
    expect(after.project_count).toBe(user.project_count);
  });

  it('refuses actions on the own account', async () => {
    const own = await api
      .POST('/admin/users/{user_id}/deactivate', params(ownAdminId))
      .catch((e) => e);
    expect(own).toBeInstanceOf(ApiError);
    expect(actionErrorKey(own)).toBe('ownAccount');

    const role = await api
      .PUT('/admin/users/{user_id}/role', { ...params(ownAdminId), body: { role: 'user' } })
      .catch((e) => e);
    expect(actionErrorKey(role)).toBe('ownAccount');
    expect(byEmail('admin@cre.ac.th').role).toBe('admin');
  });

  it('refuses to reactivate an account that is not deactivated', async () => {
    const active = byEmail('assessor@company.co.th');
    const error = await api
      .POST('/admin/users/{user_id}/reactivate', params(active.id))
      .catch((e) => e);
    expect(actionErrorKey(error)).toBe('conflict');
  });

  it('maps failures to Thai messages', () => {
    const keys = Object.keys(adminUsers.errors);
    for (const status of [404, 409, 500]) {
      expect(keys).toContain(actionErrorKey(new ApiError(status, 'x', 'x')));
    }
    expect(actionErrorKey(new ApiError(409, 'last_admin', 'x'))).toBe('lastAdmin');
    expect(actionErrorKey(new Error('network'))).toBe('generic');
  });
});

describe('badges', () => {
  it('shows Thai role and status names', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{ 'admin-users': adminUsers }}>
        <RoleBadge role="admin" />
        <StatusBadge status="deactivated" />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('ผู้ดูแลระบบ');
    expect(html).toContain('ระงับ');
  });
});
