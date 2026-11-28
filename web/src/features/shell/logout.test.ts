import { setupServer } from 'msw/node';
import { createOpenApiHttp } from 'openapi-msw';
import { QueryClient } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { paths } from '@/lib/api/generated/schema';
import { authHandlers } from '@/mocks/auth';

import { clearClientData, signOut } from './logout';

const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });
const server = setupServer(...authHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createApiClient({
  baseUrl: 'http://test.local/api/v1',
  fetch: (input, init) => fetch(input, init),
});

describe('signOut', () => {
  it('resolves on success', async () => {
    await expect(signOut(api)).resolves.toBeUndefined();
  });

  it('treats an expired session (401) as logged out', async () => {
    server.use(
      http.post('/auth/logout', ({ response }) =>
        response(401).json({ error: { code: 'unauthorized', message: 'no session' } }),
      ),
    );
    await expect(signOut(api)).resolves.toBeUndefined();
  });

  it('rethrows other failures', async () => {
    server.use(
      http.post('/auth/logout', ({ response }) =>
        response(403).json({ error: { code: 'forbidden', message: 'csrf mismatch' } }),
      ),
    );
    await expect(signOut(api)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('clearClientData', () => {
  it('drops the cached API data and the tab storage', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['projects'], [{ id: 'p1' }]);
    const storage = { clear: vi.fn() };
    clearClientData(queryClient, storage);
    expect(queryClient.getQueryData(['projects'])).toBeUndefined();
    expect(storage.clear).toHaveBeenCalledOnce();
  });

  it('still clears the cache when storage is blocked or missing', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['me'], { email: 'a@example.com' });
    const blocked = {
      clear: () => {
        throw new Error('SecurityError');
      },
    };
    expect(() => clearClientData(queryClient, blocked)).not.toThrow();
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    queryClient.setQueryData(['me'], { email: 'a@example.com' });
    clearClientData(queryClient, undefined);
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
  });
});
