import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

// The seed file is the single source of the 55 indicators (see src/mocks/catalogue.ts).
import seed from '../../../../../backend/seed/cre-indicators.json';

import { mockProject, mockProjectId, mockVersions } from '@/features/versions/mocks';

import type { IndicatorResult, Level, ResultsResponse, Version } from './api';

/** Level cut-offs of the mock only; the real ones are stored by the api. */
function levelOf(rm: number): Level {
  if (rm >= 4.5) return 'VH';
  if (rm >= 3.5) return 'H';
  if (rm >= 2.5) return 'M';
  if (rm >= 1.5) return 'L';
  return 'VL';
}

const score = (i: number, step: number) => 1 + ((i * step) % 400) / 100;

/** One scored row per catalogue indicator, spread over all five levels. */
export function mockResultItems(): IndicatorResult[] {
  return seed.indicators.map((indicator, i) => {
    const rl = score(i, 37);
    const ri_c = score(i, 53);
    const ri_t = score(i, 71);
    const ri_e = score(i, 29);
    const ri_max = Math.max(ri_c, ri_t, ri_e);
    const rm = Math.round(Math.sqrt(rl * ri_max) * 1000) / 1000;
    return {
      indicator_code: indicator.group_id,
      x: 1 + (i % 9),
      y1_pct: (i * 7) % 60,
      y2_pct: (i * 11) % 70,
      rl,
      ri_c,
      ri_t,
      ri_e,
      ri_max,
      rm,
      level: levelOf(rm),
    };
  });
}

/** Mean RM per factor in catalogue order; a factor code is the indicator code minus its number. */
function mockFactorAverages(items: IndicatorResult[]): ResultsResponse['factor_averages'] {
  const groups = new Map<string, number[]>();
  for (const item of items) {
    const factor = item.indicator_code.split('-').slice(0, 2).join('-');
    groups.set(factor, [...(groups.get(factor) ?? []), item.rm]);
  }
  return [...groups].map(([factor_code, rms]) => ({
    factor_code,
    scored_count: rms.length,
    average_rm: Math.round((rms.reduce((a, b) => a + b, 0) / rms.length) * 1000) / 1000,
  }));
}

export function mockResults(versionId: string, items = mockResultItems()): ResultsResponse {
  const level_counts = { VL: 0, L: 0, M: 0, H: 0, VH: 0 };
  for (const item of items) level_counts[item.level] += 1;
  return {
    version_id: versionId,
    submitted_at: '2026-11-14T09:40:00Z',
    editable: true,
    summary: {
      scored_count: items.length,
      level_counts,
      average_rm: items.reduce((sum, i) => sum + i.rm, 0) / items.length,
    },
    factor_averages: mockFactorAverages(items),
    items,
  };
}

const notFound = () =>
  HttpResponse.json({ error: { code: 'not_found', message: 'not found' } }, { status: 404 });

/**
 * Version detail and results for the sample versions of the version mocks:
 * v3 and v2 are submitted, v1 is a draft (the "submit first" state).
 */
export const resultHandlers: HttpHandler[] = [
  mswHttp.get('*/api/v1/projects/:projectId/versions/:versionId', ({ params }) => {
    const found = mockVersions().find((v) => v.id === params.versionId);
    if (params.projectId !== mockProjectId || !found) return notFound();
    const version: Version = {
      ...found,
      submission_no: found.status === 'submitted' ? 1 : 0,
      value_baht: mockProject.value_baht,
      start_date: mockProject.start_date,
      end_date: mockProject.end_date,
    };
    return HttpResponse.json(version);
  }),
  mswHttp.get('*/api/v1/projects/:projectId/versions/:versionId/results', ({ params }) => {
    const found = mockVersions().find((v) => v.id === params.versionId);
    if (params.projectId !== mockProjectId || found?.status !== 'submitted') return notFound();
    return HttpResponse.json(mockResults(found.id));
  }),
];
