import { describe, expect, it } from 'vitest';

import { mockVersions } from './mocks';
import {
  canCompare,
  latestVersion,
  newestFirst,
  planState,
  progressByVersion,
  projectPaths,
  readProjectView,
} from './rules';

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

  it('builds links to assessment, results, plan and the versions tab', () => {
    expect(projectPaths.assessment('p', 'v')).toBe('/projects/p/versions/v/assess');
    expect(projectPaths.results('p', 'v')).toBe('/projects/p/versions/v/results');
    expect(projectPaths.plan('p', 'v')).toBe('/projects/p/versions/v/plan');
    expect(projectPaths.versions('p')).toBe('/projects/p?tab=versions');
    expect(projectPaths.versions('p', 'rm')).toBe('/projects/p?tab=versions&view=rm');
  });

  it('reads the tab and the comparison view from the URL, with safe defaults', () => {
    const read = (q: string) => readProjectView(new URLSearchParams(q));
    expect(read('')).toEqual({ tab: 'overview', view: 'summary' });
    expect(read('tab=versions&view=rm')).toEqual({ tab: 'versions', view: 'rm' });
    expect(read('tab=nope&view=nope')).toEqual({ tab: 'overview', view: 'summary' });
  });

  it('collects progress at submit by version id, skipping drafts', () => {
    const [v3, v2, v1] = mockVersions();
    expect(progressByVersion(mockVersions())).toEqual({ [v3.id]: 45, [v2.id]: 40 });
    expect(progressByVersion([v1])).toEqual({});
  });
});
