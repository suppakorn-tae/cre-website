import { http as mswHttp, HttpResponse, type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import type { paths } from '@/lib/api/generated/schema';

import { authHandlers } from './auth';

// Typed handler factory for the generated API. Domain issues add their
// handlers to `handlers` as they define endpoints.
export const http = createOpenApiHttp<paths>({ baseUrl: '/api/v1' });

/** Response of the dev-only `/mock-sample` page. */
export const mockSampleResponse = { message: 'mocked', items: [{ id: 1 }, { id: 2 }] };

export const handlers: HttpHandler[] = [
  ...authHandlers,
  // The contract has no endpoints yet, so this one is untyped and mock-only.
  mswHttp.get('*/api/v1/mock-sample', () => HttpResponse.json(mockSampleResponse)),
];
