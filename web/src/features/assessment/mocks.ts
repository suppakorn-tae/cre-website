import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

import { mockResultItems } from '@/features/results/overview/mocks';
import { mockVersions } from '@/features/versions/mocks';

import type { AnswerInput, AnswerList } from './api';

const Y3_OPTIONS: AnswerInput['y3'][] = [
  ['A'],
  ['B'],
  ['C', 'F'],
  ['D', 'E', 'H'],
  ['G'],
  ['B', 'I'],
];

/**
 * The answers behind a submitted sample version: one complete answer per
 * scored indicator, with x, y1 and y2 as the results mock shows them. Other
 * versions have no answers.
 */
export function seededAnswers(versionId: string): AnswerInput[] {
  const version = mockVersions().find((v) => v.id === versionId);
  if (version?.status !== 'submitted' || !version.level_counts) return [];
  return mockResultItems(version.level_counts).map((item, i) => ({
    indicator_code: item.indicator_code,
    x: item.x,
    y1: { value: item.y1_pct, unit: 'percent' },
    y2: { value: item.y2_pct, unit: 'percent' },
    y3: Y3_OPTIONS[i % Y3_OPTIONS.length],
  }));
}

/**
 * Answers of any version, kept in memory; the submitted sample versions start
 * with their seeded answers. `readOnlyVersions` lists version ids that answer
 * `editable: false`.
 */
export function createAnswerHandlers(readOnlyVersions: string[] = []): HttpHandler[] {
  const stores = new Map<string, Map<string, AnswerInput>>();
  const storeOf = (id: string) => {
    let store = stores.get(id);
    if (!store) {
      store = new Map(seededAnswers(id).map((a) => [a.indicator_code, a]));
      stores.set(id, store);
    }
    return store;
  };
  const list = (versionId: string): AnswerList => ({
    version_id: versionId,
    editable: !readOnlyVersions.includes(versionId),
    items: [...storeOf(versionId).values()].map((a) => ({
      ...a,
      complete: Boolean(a.x !== undefined && a.y1 && a.y2 && a.y3?.length),
      updated_at: new Date().toISOString(),
    })),
  });
  const base = '*/api/v1/projects/:projectId/versions/:versionId/answers';
  return [
    mswHttp.get(base, ({ params }) => HttpResponse.json(list(String(params.versionId)))),
    mswHttp.post(`${base.replace(/answers$/, '')}submit`, ({ params }) => {
      const id = String(params.versionId);
      if (readOnlyVersions.includes(id)) {
        return HttpResponse.json(
          { error: { code: 'conflict', message: 'Version is not the latest' } },
          { status: 409 },
        );
      }
      const done = list(id).items.filter((a) => a.complete).length;
      if (done === 0) {
        return HttpResponse.json(
          { error: { code: 'no_complete_indicator', message: 'No complete indicator' } },
          { status: 422 },
        );
      }
      return HttpResponse.json({
        version_id: id,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        summary: { scored_count: done, level_counts: { VL: 0, L: done, M: 0, H: 0, VH: 0 } },
      });
    }),
    mswHttp.patch(base, async ({ params, request }) => {
      const id = String(params.versionId);
      const body = (await request.json()) as { answers: AnswerInput[] };
      for (const a of body.answers) storeOf(id).set(a.indicator_code, a);
      return HttpResponse.json(list(id));
    }),
  ];
}
