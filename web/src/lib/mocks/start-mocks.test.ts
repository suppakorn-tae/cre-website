import { afterEach, describe, expect, it, vi } from 'vitest';

import { gateApiFetch, isApiRequest, startMocks } from './start-mocks';

afterEach(() => vi.restoreAllMocks());

describe('startMocks', () => {
  it('resolves after a successful start', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    await expect(startMocks(start)).resolves.toBeUndefined();
    expect(start).toHaveBeenCalledOnce();
  });

  it('logs and still resolves when the worker fails to start', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(startMocks(() => Promise.reject(new Error('no worker')))).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
});

describe('gateApiFetch', () => {
  const origin = 'http://localhost:3000';

  it('holds api requests until ready, then sends them', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => (release = resolve));
    const base = vi.fn().mockResolvedValue(new Response('ok'));
    const gated = gateApiFetch(base, () => ready, origin);

    const pending = gated('/api/v1/me');
    await Promise.resolve();
    expect(base).not.toHaveBeenCalled();
    release();
    await pending;
    expect(base).toHaveBeenCalledOnce();
  });

  it('does not hold other requests', async () => {
    const base = vi.fn().mockResolvedValue(new Response('ok'));
    const gated = gateApiFetch(base, () => new Promise(() => {}), origin);
    await gated('/_next/static/chunk.js');
    await gated(new URL('/dashboard?_rsc=1', origin));
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('recognises api calls given as a URL or a Request', () => {
    expect(isApiRequest(new URL('/api/v1/me', origin), origin)).toBe(true);
    expect(isApiRequest(new Request(`${origin}/api/v1/me`), origin)).toBe(true);
    expect(isApiRequest('/apiary', origin)).toBe(false);
  });
});
