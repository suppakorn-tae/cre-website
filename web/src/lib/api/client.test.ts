import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CSRF_HEADER, createApiClient, readCookie } from './client';
import { ApiError, errorToToast } from './errors';

const base = 'http://test.local/api/v1';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// The generated schema has no paths yet; widen it for the wrapper tests.
type Loose = {
  GET: (path: string) => Promise<{ data?: unknown }>;
  POST: (path: string, init?: object) => Promise<unknown>;
};
const make = (opts: Partial<Parameters<typeof createApiClient>[0]> = {}) =>
  createApiClient({ baseUrl: base, getCsrfToken: () => 'tok', ...opts }) as unknown as Loose;

describe('api client (mocked API, no backend)', () => {
  it('loads data from the mocked api', async () => {
    server.use(http.get(`${base}/sample`, () => HttpResponse.json({ name: 'ตัวอย่าง' })));
    const { data } = await make().GET('/sample');
    expect(data).toEqual({ name: 'ตัวอย่าง' });
  });

  it('sends the CSRF header on mutations only', async () => {
    const seen: Record<string, string | null> = {};
    server.use(
      http.get(`${base}/sample`, ({ request }) => {
        seen.get = request.headers.get(CSRF_HEADER);
        return HttpResponse.json({});
      }),
      http.post(`${base}/sample`, ({ request }) => {
        seen.post = request.headers.get(CSRF_HEADER);
        return HttpResponse.json({});
      }),
    );
    const api = make();
    await api.GET('/sample');
    await api.POST('/sample', { body: {} });
    expect(seen).toEqual({ get: null, post: 'tok' });
  });

  it('throws ApiError with the code from the error envelope', async () => {
    server.use(
      http.get(`${base}/sample`, () =>
        HttpResponse.json({ error: { code: 'not_found', message: 'x' } }, { status: 404 }),
      ),
    );
    const err = await make()
      .GET('/sample')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('not_found');
    expect(errorToToast(err).messageKey).toBe('common.errors.not_found');
  });
});

describe('errorToToast', () => {
  it('falls back for unknown codes and flags 401', () => {
    expect(errorToToast(new ApiError(500, 'weird', 'm')).messageKey).toBe('common.errors.unknown');
    expect(errorToToast(new ApiError(401, 'unauthorized', 'm')).requiresLogin).toBe(true);
  });
  it('maps network failures', () => {
    expect(errorToToast(new TypeError('fetch failed')).messageKey).toBe('common.errors.network');
  });
});

describe('readCookie', () => {
  it('reads and decodes a value', () => {
    expect(readCookie('a=1; cre_csrf=x%20y', 'cre_csrf')).toBe('x y');
    expect(readCookie('a=1', 'cre_csrf')).toBeUndefined();
  });
});

describe('ApiError.fromBody fields', () => {
  it('keeps field errors of a 422 answer', () => {
    const error = ApiError.fromBody(422, {
      error: {
        code: 'validation_failed',
        message: 'x',
        fields: [{ field: '/email', code: 'invalid' }],
      },
    });
    expect(error.fields).toEqual([{ field: '/email', code: 'invalid' }]);
    expect(ApiError.fromBody(500, null).fields).toEqual([]);
  });
});
