import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

// The seed file is the single source of the 55 indicators (see src/mocks/catalogue.ts).
import seed from '../../../../../backend/seed/cre-indicators.json';

import { mockProject, mockProjectId, mockVersions } from '@/features/versions/mocks';

import type { IndicatorResult, Level, ResultsResponse, Version } from './api';

type LevelCounts = Record<Level, number>;

const LEVELS: Level[] = ['VL', 'L', 'M', 'H', 'VH'];
/** RM range of each level in the mock only; the real cut-offs come from `level_cutoffs`. */
const BANDS: Record<Level, [number, number]> = {
  VL: [1, 1.5],
  L: [1.5, 2.5],
  M: [2.5, 3.5],
  H: [3.5, 4.5],
  VH: [4.5, 5],
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Level counts and mean RM a results mock reports. The versions mock is the
 * one source of both; the rows below are built to add up to the same counts.
 * An unknown version id gets the latest version's numbers.
 */
function summaryOf(versionId: string) {
  const versions = mockVersions();
  const found = versions.find((v) => v.id === versionId && v.level_counts) ?? versions[0];
  return { counts: found.level_counts as LevelCounts, averageRm: found.average_rm };
}

/**
 * One scored row per catalogue indicator, spread over the levels exactly as
 * `counts` says (default: the latest version).
 */
export function mockResultItems(counts: LevelCounts = summaryOf('').counts): IndicatorResult[] {
  const total = seed.indicators.length;
  // A fixed shuffle: 37 is coprime to 55, so every rank 0..54 is used once.
  const levelAt = (rank: number) => {
    let from = 0;
    for (const level of LEVELS) {
      if (rank < from + counts[level])
        return { level, within: (rank - from + 0.5) / counts[level] };
      from += counts[level];
    }
    return { level: 'VH' as Level, within: 0.5 };
  };
  return seed.indicators.map((indicator, i) => {
    const { level, within } = levelAt((i * 37) % total);
    const [low, high] = BANDS[level];
    const target = low + (high - low) * (0.05 + 0.9 * within);
    // rl and ri_max stay within 1..5 and their geometric mean is the target.
    const aMin = Math.max(1 / target, target / 5);
    const aMax = Math.min(5 / target, target);
    const a = aMin + (((i * 29) % 100) / 100) * (aMax - aMin);
    const rl = round3(target * a);
    const ri_max = round3(target / a);
    const impacts = [
      ri_max,
      round3(Math.max(1, ri_max * 0.82)),
      round3(Math.max(1, ri_max * 0.64)),
    ];
    const at = (k: number) => impacts[(k + (i % 3)) % 3];
    const [ri_c, ri_t, ri_e] = [at(0), at(1), at(2)];
    const rm = round3(Math.sqrt(rl * ri_max));
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
      level,
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

export function mockResults(
  versionId: string,
  items = mockResultItems(summaryOf(versionId).counts),
): ResultsResponse {
  const level_counts = { VL: 0, L: 0, M: 0, H: 0, VH: 0 };
  for (const item of items) level_counts[item.level] += 1;
  const { averageRm } = summaryOf(versionId);
  return {
    version_id: versionId,
    submitted_at: '2026-11-14T09:40:00Z',
    editable: true,
    summary: {
      scored_count: items.length,
      level_counts,
      average_rm: averageRm ?? items.reduce((sum, i) => sum + i.rm, 0) / items.length,
    },
    level_cutoffs: { l: 1.5, m: 2.5, h: 3.5, vh: 4.5 },
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
