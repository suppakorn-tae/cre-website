import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

// Same seed the catalogue mock reads, so codes and values match.
import seed from '../../../../../backend/seed/cre-indicators.json';

import type { paths } from '@/lib/api/generated/schema';

import type { RlThreshold } from './api';
import { checkRl, SLOTS, type Check, type Parsed } from './validation';

// Feature-local mock of the admin threshold api. The shared handler list is
// not ours to edit, so `AdminThresholdMocks` adds these to the running worker.
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

const SEEDED_AT = '2026-11-01T09:00:00Z';
const nullable = (n: number | null | undefined) => n ?? null;

const seedRl = (): RlThreshold[] =>
  seed.indicators.map((i) => ({
    indicator_code: i.group_id,
    unit: i.unit_th,
    direction: 'normal',
    thresholds: {
      a: nullable(i.a),
      b: nullable(i.b),
      c: nullable(i.c),
      d: nullable(i.d),
      e: nullable(i.e),
    },
    updated_at: SEEDED_AT,
  }));

let rlStore = seedRl();

export const getRlStore = () => rlStore;
export function resetThresholdStore() {
  rlStore = seedRl();
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
];
