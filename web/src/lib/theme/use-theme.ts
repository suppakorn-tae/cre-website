'use client';

import { useCallback, useSyncExternalStore } from 'react';

import {
  applyTheme,
  DARK_QUERY,
  readStoredChoice,
  resolveTheme,
  storeChoice,
  systemTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeChoice,
} from './theme';

export interface ThemeState {
  /** What the viewer picked: `system` (default), `light` or `dark`. */
  theme: ThemeChoice;
  /** What is shown now: the choice, or the system theme when the choice is `system`. */
  resolvedTheme: ResolvedTheme;
}

export interface UseTheme extends ThemeState {
  setTheme: (choice: ThemeChoice) => void;
}

// One store per page. The choice lives here too, so it still switches for the
// session when localStorage is unavailable.
let choice: ThemeChoice | null = null;
let state: ThemeState | null = null;
const listeners = new Set<() => void>();
let stopWatching: (() => void) | null = null;

const SERVER_STATE: ThemeState = { theme: 'system', resolvedTheme: 'light' };

function update() {
  choice ??= readStoredChoice();
  const next: ThemeState = { theme: choice, resolvedTheme: resolveTheme(choice, systemTheme()) };
  applyTheme(next.resolvedTheme);
  if (state?.theme === next.theme && state.resolvedTheme === next.resolvedTheme) return;
  state = next;
  for (const l of listeners) l();
}

function watch(): () => void {
  // In system mode, follow the system theme live.
  let media: MediaQueryList | null = null;
  try {
    media = window.matchMedia(DARK_QUERY);
    media.addEventListener('change', update);
  } catch {
    media = null;
  }
  // Another tab changed the choice.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY && e.key !== null) return;
    choice = readStoredChoice();
    update();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    media?.removeEventListener('change', update);
    window.removeEventListener('storage', onStorage);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stopWatching) stopWatching = watch();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  };
}

function getSnapshot(): ThemeState {
  if (!state) update();
  return state!;
}

/** Chooses a theme, keeps it in this browser and applies it at once. */
export function setTheme(next: ThemeChoice) {
  choice = next;
  storeChoice(next);
  update();
}

/**
 * The colour theme and a setter, for the theme switch. The server render and
 * the first client render report `system` / `light`; the stored choice follows
 * right after hydration (the inline script has already painted the right theme).
 */
export function useTheme(): UseTheme {
  const s = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
  const set = useCallback((next: ThemeChoice) => setTheme(next), []);
  return { ...s, setTheme: set };
}

/** Test only: forget the cached choice and state, as on a new page load. */
export function resetThemeStoreForTests() {
  stopWatching?.();
  stopWatching = null;
  listeners.clear();
  choice = null;
  state = null;
}
