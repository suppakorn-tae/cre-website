import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

import type { AnswerInput, AnswerList } from './api';

/**
 * Answers of any version, kept in memory. `readOnlyVersions` lists version ids
 * that answer `editable: false`.
 */
export function createAnswerHandlers(readOnlyVersions: string[] = []): HttpHandler[] {
  const stores = new Map<string, Map<string, AnswerInput>>();
  const storeOf = (id: string) => {
    let store = stores.get(id);
    if (!store) stores.set(id, (store = new Map()));
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
