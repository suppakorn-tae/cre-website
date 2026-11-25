import { describe, expect, it } from 'vitest';

import { seededAnswers } from '@/features/assessment/mocks';
import { mockVersions } from '@/features/versions/mocks';

import { mockResultItems, mockResults } from './mocks';

const submitted = mockVersions().filter((v) => v.status === 'submitted');

describe('versions and results mocks share one source', () => {
  it.each(submitted.map((v) => [`v${v.version_no}`, v] as const))(
    '%s: results summary and rows match the version summary',
    (_name, version) => {
      const results = mockResults(version.id);
      expect(results.summary.level_counts).toEqual(version.level_counts);
      expect(results.summary.scored_count).toBe(version.scored_count);
      expect(results.summary.average_rm).toBe(version.average_rm);
      const counted = { VL: 0, L: 0, M: 0, H: 0, VH: 0 };
      for (const item of results.items) counted[item.level] += 1;
      expect(counted).toEqual(version.level_counts);
    },
  );

  it('keeps v3 at H 11 and VH 2 in both', () => {
    const [v3] = mockVersions();
    const { summary } = mockResults(v3.id);
    expect([v3.high_count, v3.very_high_count]).toEqual([11, 2]);
    expect([summary.level_counts.H, summary.level_counts.VH]).toEqual([11, 2]);
  });

  it('puts every row inside the RM range of its level and keeps RM = sqrt(RL x RI max)', () => {
    const range = { VL: [1, 1.5], L: [1.5, 2.5], M: [2.5, 3.5], H: [3.5, 4.5], VH: [4.5, 5] };
    for (const item of mockResultItems()) {
      const [low, high] = range[item.level];
      expect(item.rm).toBeGreaterThanOrEqual(low);
      expect(item.rm).toBeLessThanOrEqual(high);
      expect(item.rm).toBeCloseTo(Math.sqrt(item.rl * item.ri_max), 2);
      expect(item.ri_max).toBe(Math.max(item.ri_c, item.ri_t, item.ri_e));
      for (const n of [item.rl, item.ri_c, item.ri_t, item.ri_e]) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('assessment mock seeds the submitted versions', () => {
  it.each(submitted.map((v) => [`v${v.version_no}`, v.id] as const))(
    '%s has a complete answer for each scored indicator',
    (_name, id) => {
      const answers = seededAnswers(id);
      expect(answers).toHaveLength(55);
      expect(answers.every((a) => a.x !== undefined && a.y1 && a.y2 && a.y3?.length)).toBe(true);
      expect(answers.map((a) => a.indicator_code)).toEqual(
        mockResultItems().map((i) => i.indicator_code),
      );
    },
  );

  it('never combines A with another y3 option', () => {
    for (const a of seededAnswers(submitted[0].id)) {
      expect(a.y3?.includes('A') ? a.y3.length : 1).toBe(1);
    }
  });

  it('leaves the draft version and unknown versions empty', () => {
    const draft = mockVersions().find((v) => v.status === 'draft')!;
    expect(seededAnswers(draft.id)).toEqual([]);
    expect(seededAnswers('unknown')).toEqual([]);
  });
});
