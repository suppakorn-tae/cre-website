import { describe, expect, it } from 'vitest';

import { mockVersions } from './mocks';
import { canCompare, latestVersion, newestFirst, planState, projectPaths } from './rules';

describe('planState', () => {
  it('reports behind, ahead and on plan', () => {
    expect(planState(45, 48)).toEqual({ kind: 'behind', points: 3 });
    expect(planState(60, 48)).toEqual({ kind: 'ahead', points: 12 });
    expect(planState(48, 48)).toEqual({ kind: 'onPlan' });
  });
});

describe('version rules', () => {
  it('finds the editable latest version', () => {
    expect(latestVersion(mockVersions())?.version_no).toBe(3);
    expect(latestVersion([])).toBeUndefined();
  });

  it('needs two submitted versions to compare', () => {
    expect(canCompare(mockVersions())).toBe(true);
    expect(canCompare(mockVersions().slice(1))).toBe(false);
  });

  it('sorts newest first', () => {
    const sorted = newestFirst([...mockVersions()].reverse());
    expect(sorted.map((v) => v.version_no)).toEqual([3, 2, 1]);
  });

  it('builds links to assessment, results and compare', () => {
    expect(projectPaths.assessment('p', 'v')).toBe('/projects/p/versions/v/assessment');
    expect(projectPaths.results('p', 'v')).toBe('/projects/p/versions/v/results');
    expect(projectPaths.compare('p')).toBe('/projects/p/compare');
  });
});
