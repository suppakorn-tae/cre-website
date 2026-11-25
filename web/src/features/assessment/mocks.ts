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
    mswHttp.patch(base, async ({ params, request }) => {
      const id = String(params.versionId);
      const body = (await request.json()) as { answers: AnswerInput[] };
      for (const a of body.answers) storeOf(id).set(a.indicator_code, a);
      return HttpResponse.json(list(id));
    }),
  ];
}
