import { setupServer } from 'msw/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { components } from '@/lib/api/generated/schema';

import seed from '../../../backend/seed/cre-indicators.json';

import { catalogueHandlers } from './catalogue';

const server = setupServer(...catalogueHandlers);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

const base = 'http://localhost/api/v1';

describe('catalogue mocks', () => {
  it('returns all 55 indicators grouped by dimension and factor, matching the seed', async () => {
    const res = await fetch(`${base}/catalogue?locale=en`);
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBeTruthy();
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    // Typed against the generated schema: a contract change breaks compilation.
    const body: components['schemas']['Catalogue'] = await res.json();

    expect(body.locale).toBe('th');
    expect(body.dimensions.map((d) => d.code)).toEqual(seed.dimensions.map((d) => d.code));
    const factors = body.dimensions.flatMap((d) => d.factors);
    expect(factors.map((f) => f.code).sort()).toEqual(seed.factors.map((f) => f.code).sort());
    for (const d of body.dimensions) {
      for (const f of d.factors) {
        const seedFactor = seed.factors.find((x) => x.code === f.code);
        expect(seedFactor?.dimension_code).toBe(d.code);
        expect(f.name).toBe(seedFactor?.name_th);
        for (const i of f.indicators) {
          expect(seed.indicators.find((x) => x.group_id === i.code)?.factor_code).toBe(f.code);
        }
      }
    }
    const indicators = factors.flatMap((f) => f.indicators);
    expect(indicators).toHaveLength(55);
    expect(indicators.map((i) => i.code).sort()).toEqual(
      seed.indicators.map((i) => i.group_id).sort(),
    );
    expect(indicators[0]?.name).toMatch(/[฀-๿]/);
  });

  it('returns options A to I with only A exclusive', async () => {
    const res = await fetch(`${base}/catalogue`);
    const body: components['schemas']['Catalogue'] = await res.json();
    expect(body.ri_e_options.map((o) => o.code).join('')).toBe('ABCDEFGHI');
    expect(body.ri_e_options.filter((o) => o.is_exclusive).map((o) => o.code)).toEqual(['A']);
  });

  it('answers 304 when If-None-Match matches', async () => {
    const first = await fetch(`${base}/catalogue`);
    const res = await fetch(`${base}/catalogue`, {
      headers: { 'If-None-Match': first.headers.get('etag') ?? '' },
    });
    expect(res.status).toBe(304);
  });

  it('lists islands and project types with other last', async () => {
    const islands: components['schemas']['IslandList'] = await (
      await fetch(`${base}/islands`)
    ).json();
    const types: components['schemas']['ProjectTypeList'] = await (
      await fetch(`${base}/project-types`)
    ).json();
    expect(islands.items.at(-1)?.code).toBe('other');
    expect(islands.items[0]?.code).toBe('koh_tao');
    expect(types.items.at(-1)?.code).toBe('other');
    expect(types.items).toHaveLength(6);
  });
});
