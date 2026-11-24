import type { HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import type { paths } from '@/lib/api/generated/schema';

// Typed handler factory for the generated API. Domain issues add their
// handlers to `handlers` as they define endpoints.
export const http = createOpenApiHttp<paths>({ baseUrl: '/api/v1' });

export const handlers: HttpHandler[] = [];
