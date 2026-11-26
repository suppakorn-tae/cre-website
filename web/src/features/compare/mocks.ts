import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

import { mockResultItems } from '@/features/results/overview/mocks';
import { mockVersions } from '@/features/versions/mocks';

import type { IndicatorRmMatrix, TrendPoint, VersionComparison } from './api';

/**
 * The trend, the comparison and the per-indicator RM all come from the version
 * mocks (and the results mock for each indicator), so every page shows the same
 * numbers: v1 never submitted, v2 and v3 submitted.
 */
const ascending = () => [...mockVersions()].sort((a, b) => a.version_no - b.version_no);

export const mockTrend = (): TrendPoint[] =>
  ascending().map((v) => {
    const submitted = v.status === 'submitted' && v.level_counts !== null;
    return {
      version_id: v.id,
      version_no: v.version_no,
      status: v.status,
      submitted_at: submitted ? v.submitted_at : null,
      avg_rm: submitted ? v.average_rm : null,
      h_vh_count: submitted ? (v.high_count ?? 0) + (v.very_high_count ?? 0) : null,
      level_distribution: submitted ? (v.level_counts ?? null) : null,
    };
  });

export const mockComparison = (base: string, target: string): VersionComparison => {
  const versions = ascending();
  const find = (id: string) => versions.find((v) => v.id === id) ?? versions[1];
  const metrics = (id: string) => {
    const v = find(id);
    return {
      version_id: v.id,
      version_no: v.version_no,
      submitted_at: v.submitted_at ?? '2026-11-14T09:40:00Z',
      progress_at_submit: v.progress_at_submit ?? 0,
      avg_rm: v.average_rm,
      h_vh_count: (v.high_count ?? 0) + (v.very_high_count ?? 0),
      scored_count: v.scored_count ?? 0,
    };
  };
  return {
    base: metrics(base),
    target: metrics(target),
    level_up_count: 5,
    level_down_count: 12,
    level_changes: [
      {
        indicator_code: 'EC-MG-1',
        factor_code: 'EC-MG',
        base_level: 'H',
        target_level: 'M',
        base_rm: 4,
        target_rm: 3,
        direction: 'down',
      },
      {
        indicator_code: 'EC-MG-2',
        factor_code: 'EC-MG',
        base_level: 'VH',
        target_level: 'H',
        base_rm: 5,
        target_rm: 4,
        direction: 'down',
      },
      {
        indicator_code: 'EC-TC-1',
        factor_code: 'EC-TC',
        base_level: 'L',
        target_level: 'M',
        base_rm: 2,
        target_rm: 3,
        direction: 'up',
      },
    ],
  };
};

/** RM of every catalogue indicator in each version; a never-submitted version has none. */
export const mockIndicatorRm = (): IndicatorRmMatrix => {
  const versions = ascending();
  const perVersion = versions.map((v) =>
    v.level_counts && v.status === 'submitted' ? mockResultItems(v.level_counts) : null,
  );
  const rows = mockResultItems();
  return {
    versions: versions.map((v, i) => ({
      version_id: v.id,
      version_no: v.version_no,
      submitted: perVersion[i] !== null,
    })),
    indicators: rows.map((row, index) => ({
      indicator_code: row.indicator_code,
      factor_code: row.indicator_code.split('-').slice(0, 2).join('-'),
      points: versions.map((v, i) => {
        const item = perVersion[i]?.[index];
        return { version_id: v.id, rm: item?.rm ?? null, level: item?.level ?? null };
      }),
    })),
  };
};

/** Compare handlers for any project id. */
export function createCompareHandlers(): HttpHandler[] {
  const submitted = () => ascending().filter((v) => v.status === 'submitted');
  return [
    mswHttp.get('*/api/v1/projects/:projectId/trend', () =>
      HttpResponse.json({ versions: mockTrend() }),
    ),
    mswHttp.get('*/api/v1/projects/:projectId/compare', ({ request }) => {
      const q = new URL(request.url).searchParams;
      const [older, newer] = submitted().slice(-2);
      return HttpResponse.json(
        mockComparison(
          q.get('base_version_id') ?? older.id,
          q.get('target_version_id') ?? newer.id,
        ),
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
