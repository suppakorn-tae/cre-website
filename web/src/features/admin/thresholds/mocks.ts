import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

// Same seed the catalogue mock reads, so codes and values match.
import seed from '../../../../../backend/seed/cre-indicators.json';

import type { paths } from '@/lib/api/generated/schema';

import type { ImpactTables, RlThreshold } from './api';
import { checkImpact, checkRl, SLOTS, type Check, type Parsed } from './validation';

// Feature-local mock of the admin threshold api. The shared handler list is
// not ours to edit, so `AdminThresholdMocks` adds these to the running worker.
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

const SEEDED_AT = '2026-11-01T09:00:00Z';
const nullable = (n: number | null | undefined) => n ?? null;

/**
 * Direction of an indicator from its seeded thresholds, as the backend derives
 * it (backend/internal/seed/catalogue.go): ascending is `normal`, descending is
 * `inverse`. Unset slots are skipped; the seed has no other shape.
 */
export function directionOf(thresholds: (number | null | undefined)[]): RlThreshold['direction'] {
  const values = thresholds.filter((v): v is number => v !== null && v !== undefined);
  if (values.length < 3) throw new Error('fewer than three thresholds');
  const pairs = values.slice(1).map((v, k) => [values[k], v]);
  if (pairs.every(([prev, next]) => prev < next)) return 'normal';
  if (pairs.every(([prev, next]) => prev > next)) return 'inverse';
  throw new Error('thresholds are not strictly monotonic');
}

const seedRl = (): RlThreshold[] =>
  seed.indicators.map((i) => ({
    indicator_code: i.group_id,
    unit: i.unit_th,
    direction: directionOf([i.a, i.b, i.c, i.d, i.e]),
    thresholds: {
      a: nullable(i.a),
      b: nullable(i.b),
      c: nullable(i.c),
      d: nullable(i.d),
      e: nullable(i.e),
    },
    updated_at: SEEDED_AT,
  }));

const seedImpact = (): ImpactTables => ({
  ri_c: { code: 'RI_C', thresholds: { ...seed.ri_c_thresholds }, updated_at: SEEDED_AT },
  ri_t: { code: 'RI_T', thresholds: { ...seed.ri_t_thresholds }, updated_at: SEEDED_AT },
});

let rlStore = seedRl();
let impactStore = seedImpact();

export const getRlStore = () => rlStore;
export const getImpactStore = () => impactStore;
export function resetThresholdStore() {
  rlStore = seedRl();
  impactStore = seedImpact();
}
/** Test hook: makes one indicator inverse, as the real catalogue has some. */
export function setDirection(code: string, direction: RlThreshold['direction']) {
  rlStore = rlStore.map((r) => (r.indicator_code === code ? { ...r, direction } : r));
}

const validation = (field: string, c: Check) => ({
  error: {
    code: 'validation_failed',
    message: 'the request failed validation',
    fields: [
      ...SLOTS.filter((s) => c.fields[s]).map((s) => ({
        field: `${field}/${s}`,
        code: c.fields[s] === 'negative' ? 'negative' : 'invalid',
      })),
      ...(c.form
        ? [{ field, code: c.form === 'pattern' ? 'invalid_pattern' : 'invalid_order' }]
        : []),
    ],
  },
});

const notFound = { error: { code: 'not_found', message: 'indicator not found' } };

export const adminThresholdHandlers: HttpHandler[] = [
  http.get('/admin/rl-thresholds', ({ response }) => response(200).json({ items: rlStore })),
  http.put('/admin/rl-thresholds/{indicator_code}', async ({ params, request, response }) => {
    const current = rlStore.find((r) => r.indicator_code === params.indicator_code);
    if (!current) return response(404).json(notFound);
    const { thresholds } = (await request.clone().json()) as Pick<RlThreshold, 'thresholds'>;
    const check = checkRl(current.direction, thresholds as Parsed);
    if (check.form || Object.keys(check.fields).length > 0) {
      return response(422).json(validation('/thresholds', check));
    }
    const updated = { ...current, thresholds, updated_at: new Date().toISOString() };
    rlStore = rlStore.map((r) => (r === current ? updated : r));
    return response(200).json(updated);
  }),
  http.get('/admin/impact-tables', ({ response }) => response(200).json(impactStore)),
  http.put('/admin/impact-tables', async ({ request, response }) => {
    const body = (await request.clone().json()) as {
      ri_c?: Parsed;
      ri_t?: Parsed;
    };
    for (const [key, field] of [
      ['ri_c', '/ri_c'],
      ['ri_t', '/ri_t'],
    ] as const) {
      const values = body[key];
      if (!values) continue;
      const check = checkImpact(values);
      if (check.form || Object.keys(check.fields).length > 0) {
        return response(422).json(validation(field, check));
      }
    }
    const now = new Date().toISOString();
    impactStore = {
      ri_c: body.ri_c
        ? { code: 'RI_C', thresholds: body.ri_c as never, updated_at: now }
        : impactStore.ri_c,
      ri_t: body.ri_t
        ? { code: 'RI_T', thresholds: body.ri_t as never, updated_at: now }
        : impactStore.ri_t,
    };
    return response(200).json(impactStore);
  }),
];
