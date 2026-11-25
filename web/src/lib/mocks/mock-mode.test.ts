import { describe, expect, it } from 'vitest';

import {
  assertNoMocksInProduction,
  isMockMode,
  MOCKS_IN_PRODUCTION_MESSAGE,
  mockRole,
} from './mock-mode';

describe('isMockMode', () => {
  it('is on only with the flag set to 1 outside production', () => {
    expect(isMockMode({ NEXT_PUBLIC_API_MOCKS: '1', NODE_ENV: 'development' })).toBe(true);
    expect(isMockMode({ NEXT_PUBLIC_API_MOCKS: '1', NODE_ENV: 'test' })).toBe(true);
    expect(isMockMode({ NEXT_PUBLIC_API_MOCKS: '0', NODE_ENV: 'development' })).toBe(false);
    expect(isMockMode({ NODE_ENV: 'development' })).toBe(false);
  });

  it('is never on in production', () => {
    expect(isMockMode({ NEXT_PUBLIC_API_MOCKS: '1', NODE_ENV: 'production' })).toBe(false);
  });
});

describe('assertNoMocksInProduction', () => {
  it('refuses a production build or server with mocks on, with a clear message', () => {
    expect(() =>
      assertNoMocksInProduction({ NEXT_PUBLIC_API_MOCKS: '1', NODE_ENV: 'production' }),
    ).toThrow(MOCKS_IN_PRODUCTION_MESSAGE);
    expect(MOCKS_IN_PRODUCTION_MESSAGE).toContain('NEXT_PUBLIC_API_MOCKS');
  });

  it('allows production without mocks and development with mocks', () => {
    expect(() => assertNoMocksInProduction({ NODE_ENV: 'production' })).not.toThrow();
    expect(() =>
      assertNoMocksInProduction({ NEXT_PUBLIC_API_MOCKS: '0', NODE_ENV: 'production' }),
    ).not.toThrow();
    expect(() =>
      assertNoMocksInProduction({ NEXT_PUBLIC_API_MOCKS: '1', NODE_ENV: 'development' }),
    ).not.toThrow();
  });
});

describe('mockRole', () => {
  it('is admin only for CRE_MOCK_ROLE=admin', () => {
    expect(mockRole({ CRE_MOCK_ROLE: 'admin' })).toBe('admin');
    expect(mockRole({ CRE_MOCK_ROLE: 'user' })).toBe('user');
    expect(mockRole({})).toBe('user');
  });
});
