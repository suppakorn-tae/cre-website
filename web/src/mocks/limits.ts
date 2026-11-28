/**
 * localStorage flags that set the limits the mock api answers with, so a test or a person can
 * reach the limit without making dozens of rows. The numbers are positive integers.
 */
export const MAX_PROJECTS_FLAG = 'cre-mock-max-projects';
export const MAX_VERSIONS_FLAG = 'cre-mock-max-versions';

/** The real limits are 3 projects and 10 versions; the mock store seeds more projects than 3, so its default is above them. */
export const MOCK_MAX_PROJECTS = 50;
export const MOCK_MAX_VERSIONS = 10;

/** The flag's value when it is a positive integer, else `fallback`. Read on every request. */
export function mockLimit(flag: string, fallback: number): number {
  try {
    const value = Number(globalThis.localStorage?.getItem(flag));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}
