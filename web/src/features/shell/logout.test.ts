import { setupServer } from 'msw/node';
import { createOpenApiHttp } from 'openapi-msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApiClient } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import type { paths } from '@/lib/api/generated/schema';
import { authHandlers } from '@/mocks/auth';

import { signOut } from './logout';

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
