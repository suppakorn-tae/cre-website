import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return (await import('./VersionMocks')).VersionMocks;
}

describe('VersionMocks', () => {
  it('renders children straight away when mocks are off', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MOCKS', '');
    const VersionMocks = await load();
    expect(renderToStaticMarkup(<VersionMocks>เนื้อหา</VersionMocks>)).toBe('เนื้อหา');
  });

  it('holds children back until the handlers are registered when mocks are on', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MOCKS', '1');
    const VersionMocks = await load();
    expect(renderToStaticMarkup(<VersionMocks>เนื้อหา</VersionMocks>)).toBe('');
  });
});
