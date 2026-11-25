/**
 * Server-side switches for mock mode (`NEXT_PUBLIC_API_MOCKS=1`). MSW only runs
 * in the browser, so the server guard answers from the mock session instead of
 * calling an api that is not there. Never use this in a production build.
 */

export type MockEnv = Partial<Record<string, string | undefined>>;

export const MOCKS_IN_PRODUCTION_MESSAGE =
  'NEXT_PUBLIC_API_MOCKS=1 is set in a production build. Mock mode skips the sign-in check, ' +
  'so it is for local work only. Unset NEXT_PUBLIC_API_MOCKS and build again.';

/** True when mock mode is on and the process is not a production one. */
export function isMockMode(env: MockEnv = process.env): boolean {
  return env.NEXT_PUBLIC_API_MOCKS === '1' && env.NODE_ENV !== 'production';
}

/** Throws when mock mode is on in a production build or server. */
export function assertNoMocksInProduction(env: MockEnv = process.env): void {
  if (env.NEXT_PUBLIC_API_MOCKS === '1' && env.NODE_ENV === 'production') {
    throw new Error(MOCKS_IN_PRODUCTION_MESSAGE);
  }
}

/** `CRE_MOCK_ROLE=admin` opens the admin area in mock mode; anything else is a user. */
export function mockRole(env: MockEnv = process.env): 'user' | 'admin' {
  return env.CRE_MOCK_ROLE === 'admin' ? 'admin' : 'user';
}
