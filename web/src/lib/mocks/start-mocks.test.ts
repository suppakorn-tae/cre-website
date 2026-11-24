import { afterEach, describe, expect, it, vi } from 'vitest';

import { startMocks } from './start-mocks';

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
