import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

import { mockProjectId, mockVersions } from '@/features/versions/mocks';

import type { IndicatorResult, ResultsResponse } from '../overview/api';
import { mockResults } from '../overview/mocks';
import type { Strategy } from '../strategy/api';

type Advice = NonNullable<IndicatorResult['advice']>;

const text = (list: string, n: number) =>
  Array.from({ length: n }, (_, i) => `คำแนะนำ ${list} ข้อที่ ${i + 1}`);

/** Advice shapes cycled over the H / VH rows: 1, 3 and 5 items, two-way and three-way ties. */
const SHAPES: Advice[] = [
  [{ list: 'RL', items: text('RL', 1) }],
  [{ list: 'RI_T', items: text('RI_T', 3) }],
  [{ list: 'RI_E', items: text('RI_E', 5) }],
  [
    { list: 'RI_C', items: text('RI_C', 2) },
    { list: 'RI_T', items: text('RI_T', 4) },
  ],
  [
    { list: 'RL', items: text('RL', 5) },
    { list: 'RI_C', items: text('RI_C', 1) },
    { list: 'RI_E', items: text('RI_E', 3) },
  ],
];
const STRATEGIES: (Strategy | undefined)[] = ['REDUCE', undefined, 'TRANSFER', undefined, 'ACCEPT'];

/** Mock results with advice on every H / VH row and a strategy on some. */
export function mockResultsWithAdvice(versionId: string, editable = true): ResultsResponse {
  const base = mockResults(versionId);
  let n = 0;
  const items = base.items.map((item) => {
    if (item.level !== 'H' && item.level !== 'VH') return item;
    const k = n++ % SHAPES.length;
    const strategy = STRATEGIES[k];
    return {
      ...item,
      advice: SHAPES[k],
      ...(strategy && { strategy, strategy_updated_at: '2026-11-14T10:05:00Z' }),
    };
  });
  return { ...base, items, editable };
}

const err = (status: number, code: string) =>
  HttpResponse.json({ error: { code, message: code } }, { status });

/**
 * Results with advice (the latest version is editable, older ones are not)
 * and the strategy save: 409 on an older version, 422 on a row below H.
 * Not yet registered by ResultsMocks (IO-55); add `hvhHandlers` there.
 */
export const hvhHandlers: HttpHandler[] = [
  mswHttp.get('*/api/v1/projects/:projectId/versions/:versionId/results', ({ params }) => {
    const [latest] = mockVersions();
    const found = mockVersions().find((v) => v.id === params.versionId);
    if (params.projectId !== mockProjectId || found?.status !== 'submitted') {
      return err(404, 'not_found');
    }
    return HttpResponse.json(mockResultsWithAdvice(found.id, found.id === latest.id));
  }),
  mswHttp.put(
    '*/api/v1/projects/:projectId/versions/:versionId/results/:code/strategy',
    async ({ params, request }) => {
      if (params.versionId !== mockVersions()[0].id) return err(409, 'conflict');
      const { strategy } = (await request.json()) as { strategy: Strategy };
      const row = mockResultsWithAdvice(String(params.versionId)).items.find(
        (i) => i.indicator_code === params.code,
      );
      if (!row || (row.level !== 'H' && row.level !== 'VH')) return err(422, 'not_high_risk');
      return HttpResponse.json({
        indicator_code: row.indicator_code,
        strategy,
        updated_at: new Date().toISOString(),
      });
    },
  ),
];
