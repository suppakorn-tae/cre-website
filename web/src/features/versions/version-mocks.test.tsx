import type { HttpHandler } from 'msw';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('@/mocks/browser');
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return import('./VersionMocks');
}

describe('VersionMocks', () => {
  it('renders children straight away when mocks are off', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MOCKS', '');
    const { VersionMocks } = await load();
    expect(renderToStaticMarkup(<VersionMocks>เนื้อหา</VersionMocks>)).toBe('เนื้อหา');
  });

  it('holds children back until the handlers are registered when mocks are on', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_MOCKS', '1');
    const { VersionMocks } = await load();
    expect(renderToStaticMarkup(<VersionMocks>เนื้อหา</VersionMocks>)).toBe('');
  });

  it('registers both the project and the version handlers', async () => {
    let registered: HttpHandler[] = [];
    vi.doMock('@/mocks/browser', () => ({
      worker: { use: (...h: HttpHandler[]) => (registered = h) },
    }));
    const { registerVersionMocks } = await load();
    await registerVersionMocks();

    // A direct load of the detail page needs the project and its versions.
    const server = setupServer(...registered);
    server.listen({ onUnhandledFrame: 'error' });
    try {
      const id = '0193a5c2-7b1e-7c3a-9d4f-000000000001';
      const project = await fetch(`http://localhost/api/v1/projects/${id}`);
      expect(project.status).toBe(200);
      expect((await project.json()).id).toBe(id);
      const versions = await fetch(`http://localhost/api/v1/projects/${id}/versions`);
      expect(versions.status).toBe(200);
      expect((await versions.json()).items.length).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });
});
