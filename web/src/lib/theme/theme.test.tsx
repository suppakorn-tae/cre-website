// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readStoredChoice, resolveTheme, THEME_STORAGE_KEY } from './theme';
import { THEME_INIT_SCRIPT } from './theme-script';
import { resetThemeStoreForTests, useTheme } from './use-theme';

/** A controllable `prefers-color-scheme: dark` media query. */
function mockSystem(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  return {
    set(next: boolean) {
      dark = next;
      for (const l of [...listeners]) l();
    },
    listeners,
  };
}

/** Makes every localStorage access throw, as in a locked-down browser. */
function blockStorage() {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
}

const html = () => document.documentElement;

beforeEach(() => {
  resetThemeStoreForTests();
  window.localStorage.clear();
  html().removeAttribute('data-theme');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
  it('follows the system only in system mode', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });
});

describe('readStoredChoice', () => {
  it('reads a stored choice and ignores anything else', () => {
    expect(readStoredChoice()).toBe('system');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readStoredChoice()).toBe('dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readStoredChoice()).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    blockStorage();
    expect(readStoredChoice()).toBe('system');
  });
});

describe('useTheme', () => {
  it('defaults to system and follows a light system', () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('defaults to system and follows a dark system', () => {
    mockSystem(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ theme: 'system', resolvedTheme: 'dark' });
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('uses a stored choice over the system', () => {
    mockSystem(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ theme: 'light', resolvedTheme: 'light' });
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('switches to light and dark, keeps the choice, and clears it for system', () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('dark'));
    expect(result.current).toMatchObject({ theme: 'dark', resolvedTheme: 'dark' });
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => result.current.setTheme('light'));
    expect(result.current).toMatchObject({ theme: 'light', resolvedTheme: 'light' });
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    act(() => result.current.setTheme('system'));
    expect(result.current).toMatchObject({ theme: 'system', resolvedTheme: 'light' });
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('keeps the choice after a reload', () => {
    mockSystem(false);
    const first = renderHook(() => useTheme());
    act(() => first.result.current.setTheme('dark'));
    first.unmount();

    resetThemeStoreForTests();
    html().removeAttribute('data-theme');
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ theme: 'dark', resolvedTheme: 'dark' });
  });

  it('follows a system change live in system mode', () => {
    const system = mockSystem(false);
    const { result } = renderHook(() => useTheme());
    act(() => system.set(true));
    expect(result.current.resolvedTheme).toBe('dark');
    expect(html().getAttribute('data-theme')).toBe('dark');
    act(() => system.set(false));
    expect(result.current.resolvedTheme).toBe('light');
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('ignores a system change when a theme is chosen', () => {
    const system = mockSystem(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    act(() => system.set(true));
    expect(result.current.resolvedTheme).toBe('light');
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('picks up a choice made in another tab', () => {
    mockSystem(false);
    const { result } = renderHook(() => useTheme());
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
    });
    expect(result.current.theme).toBe('dark');
  });

  it('stops listening to the system when no component uses it', () => {
    const system = mockSystem(false);
    const { unmount } = renderHook(() => useTheme());
    expect(system.listeners.size).toBe(1);
    unmount();
    expect(system.listeners.size).toBe(0);
  });

  it('works with no localStorage: switches for the session', () => {
    mockSystem(true);
    blockStorage();
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ theme: 'system', resolvedTheme: 'dark' });
    act(() => result.current.setTheme('light'));
    expect(result.current).toMatchObject({ theme: 'light', resolvedTheme: 'light' });
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('works with no matchMedia: system resolves to light', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ theme: 'system', resolvedTheme: 'light' });
    act(() => result.current.setTheme('dark'));
    expect(result.current.resolvedTheme).toBe('dark');
  });
});

describe('the inline script (runs before the first paint)', () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it.each([
    [null, false, 'light'],
    [null, true, 'dark'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['purple', true, 'dark'],
  ] as const)('stored %s, system dark %s: %s', (stored, dark, expected) => {
    mockSystem(dark);
    if (stored) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
    run();
    expect(html().getAttribute('data-theme')).toBe(expected);
  });

  it('follows the system when storage throws', () => {
    mockSystem(true);
    blockStorage();
    expect(run).not.toThrow();
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to light with no storage and no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    blockStorage();
    expect(run).not.toThrow();
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('agrees with the hook on every case', () => {
    for (const stored of [null, 'system', 'light', 'dark'] as const) {
      for (const dark of [false, true]) {
        resetThemeStoreForTests();
        window.localStorage.clear();
        mockSystem(dark);
        if (stored) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
        run();
        const fromScript = html().getAttribute('data-theme');
        const { result, unmount } = renderHook(() => useTheme());
        expect(result.current.resolvedTheme, `${stored} ${dark}`).toBe(fromScript);
        unmount();
      }
    }
  });
});
