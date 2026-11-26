import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, connection } = vi.hoisted(() => ({ get: vi.fn(), connection: vi.fn() }));

vi.mock('next/server', () => ({ connection }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('@/lib/api/server', () => ({ serverApi: async () => ({ GET: get }) }));

import { adminUserEmail, projectTitleData, versionTitleContext } from './context';

const session = (role: 'user' | 'admin') => ({
  data: { user: { id: 'u1', email: 'me@cre.ac.th', role } },
});
const userRecord = { data: { id: 'u2', email: 'secret@cre.ac.th', role: 'user' } };

/** Answers `/auth/me` with `me`; answers the user read with 200 on purpose. */
function api(me: () => unknown) {
  get.mockImplementation(async (path: string) => {
    if (path === '/auth/me') return me();
    if (path === '/admin/users/{user_id}') return userRecord;
    if (path === '/projects/{project_id}') return { data: { nickname: 'TK2', name: 'ท่าเรือ' } };
    if (path === '/projects/{project_id}/versions/{version_id}') return { data: { version_no: 3 } };
    throw new Error(`unexpected ${path}`);
  });
}
const userReads = () => get.mock.calls.filter(([path]) => path === '/admin/users/{user_id}');

beforeEach(() => {
  get.mockReset();
  connection.mockReset();
});

describe('adminUserEmail', () => {
  it('gives the e-mail to an admin', async () => {
    api(() => session('admin'));

    expect(await adminUserEmail('u2')).toBe('secret@cre.ac.th');
  });

  it('never reads the user for a non-admin, even when the api would answer 200', async () => {
    api(() => session('user'));

    expect(await adminUserEmail('u2')).toBeUndefined();
    expect(userReads()).toHaveLength(0);
  });

  it('never reads the user without a session', async () => {
    api(() => {
      throw Object.assign(new Error('no session'), { status: 401 });
    });

    expect(await adminUserEmail('u2')).toBeUndefined();
    expect(userReads()).toHaveLength(0);
  });
});

describe('title data', () => {
  it('opts out of prerendering before it reads the api', async () => {
    api(() => session('user'));

    expect(await projectTitleData('p1')).toEqual({ nickname: 'TK2', name: 'ท่าเรือ' });
    expect(await versionTitleContext('p1', 'v1')).toBe('TK2 v3');
    const firstRead = Math.min(...get.mock.invocationCallOrder);
    expect(connection).toHaveBeenCalled();
    expect(Math.min(...connection.mock.invocationCallOrder)).toBeLessThan(firstRead);
  });
});
