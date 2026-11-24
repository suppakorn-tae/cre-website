import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { handlers } from './handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

describe('mock handlers', () => {
  it('serves the sample response used by the dev mock page', async () => {
    const res = await fetch('http://localhost/api/v1/mock-sample');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'mocked', items: [{ id: 1 }, { id: 2 }] });
  });
});
