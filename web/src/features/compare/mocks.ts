import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

import type { IndicatorRmMatrix, TrendPoint, VersionComparison } from './api';

const vid = (no: number) => `0193a5c2-0000-7000-8000-00000000010${no}`;

export const mockTrend = (): TrendPoint[] => [
  {
    version_id: vid(1),
    version_no: 1,
    status: 'submitted',
    submitted_at: '2026-10-30T04:00:00Z',
    avg_rm: 3.2,
    h_vh_count: 20,
    level_distribution: { VL: 5, L: 15, M: 40, H: 15, VH: 5 },
  },
  {
    version_id: vid(2),
    version_no: 2,
    status: 'submitted',
    submitted_at: '2026-11-05T04:20:00Z',
    avg_rm: 3.03,
    h_vh_count: 18,
    level_distribution: { VL: 6, L: 17, M: 40, H: 14, VH: 4 },
  },
  {
    version_id: vid(3),
    version_no: 3,
    status: 'submitted',
    submitted_at: '2026-11-14T09:40:00Z',
    avg_rm: 2.71,
    h_vh_count: 13,
    level_distribution: { VL: 8, L: 20, M: 40, H: 11, VH: 2 },
  },
  {
    version_id: vid(4),
    version_no: 4,
    status: 'draft',
    submitted_at: null,
    avg_rm: null,
    h_vh_count: null,
    level_distribution: null,
  },
];

export const mockComparison = (base: string, target: string): VersionComparison => {
  const find = (id: string) => mockTrend().find((p) => p.version_id === id) ?? mockTrend()[0];
  const metrics = (p: TrendPoint) => ({
    version_id: p.version_id,
    version_no: p.version_no,
    submitted_at: p.submitted_at ?? '2026-11-14T09:40:00Z',
    progress_at_submit: p.version_no * 15,
    avg_rm: p.avg_rm,
    h_vh_count: p.h_vh_count ?? 0,
    scored_count: 80,
  });
  return {
    base: metrics(find(base)),
    target: metrics(find(target)),
    level_up_count: 1,
    level_down_count: 2,
    level_changes: [
      {
        indicator_code: 'ind_a',
        factor_code: 'fac_1',
        base_level: 'H',
        target_level: 'M',
        base_rm: 4,
        target_rm: 3,
        direction: 'down',
      },
      {
        indicator_code: 'ind_b',
        factor_code: 'fac_1',
        base_level: 'VH',
        target_level: 'H',
        base_rm: 5,
        target_rm: 4,
        direction: 'down',
      },
      {
        indicator_code: 'ind_c',
        factor_code: 'fac_2',
        base_level: 'L',
        target_level: 'M',
        base_rm: 2,
        target_rm: 3,
        direction: 'up',
      },
    ],
  };
};

export const mockIndicatorRm = (): IndicatorRmMatrix => ({
  versions: mockTrend().map((p) => ({
    version_id: p.version_id,
    version_no: p.version_no,
    submitted: p.status === 'submitted',
  })),
  indicators: [
    { indicator_code: 'ind_a', factor_code: 'fac_1', rms: [4, 3.5, 3, null] },
    { indicator_code: 'ind_c', factor_code: 'fac_2', rms: [2, 2, 3, null] },
  ].map((row) => ({
    indicator_code: row.indicator_code,
    factor_code: row.factor_code,
    points: row.rms.map((rm, i) => ({
      version_id: vid(i + 1),
      rm,
      level: rm === null ? null : rm >= 4 ? 'H' : rm >= 3 ? 'M' : 'L',
    })),
  })),
});

/** Compare handlers for any project id. */
export function createCompareHandlers(): HttpHandler[] {
  return [
    mswHttp.get('*/api/v1/projects/:projectId/trend', () =>
      HttpResponse.json({ versions: mockTrend() }),
    ),
    mswHttp.get('*/api/v1/projects/:projectId/compare', ({ request }) => {
      const q = new URL(request.url).searchParams;
      return HttpResponse.json(
        mockComparison(q.get('base_version_id') ?? vid(2), q.get('target_version_id') ?? vid(3)),
      );
    }),
    mswHttp.get('*/api/v1/projects/:projectId/indicator-rm', ({ request }) => {
      const factors = new URL(request.url).searchParams.getAll('factor_code');
      const all = mockIndicatorRm();
      return HttpResponse.json({
        ...all,
        indicators: factors.length
          ? all.indicators.filter((i) => factors.includes(i.factor_code))
          : all.indicators,
      });
    }),
  ];
}
