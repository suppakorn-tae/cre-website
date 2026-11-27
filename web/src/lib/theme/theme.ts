/**
 * Colour theme: the viewer's choice, how it resolves, and where it is kept.
 *
 * Three choices: follow the system (default), light or dark. The choice is kept
 * per browser in localStorage; every access is wrapped, so a blocked or missing
 * storage falls back to the system theme. The resolved theme is written to
 * `<html data-theme="light|dark">`, which styles/tokens.css reads.
 */

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key of the choice. The inline script in `theme-script.tsx` reads the same key. */
export const THEME_STORAGE_KEY = 'cre-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The stored choice, or `system` when there is none, it is unknown or storage is unavailable. */
export function readStoredChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Keeps the choice; `system` clears it. Returns false when storage is unavailable. */
export function storeChoice(choice: ThemeChoice): boolean {
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/** The system theme from `prefers-color-scheme`; light when it cannot be read. */
export function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function resolveTheme(choice: ThemeChoice, system: ResolvedTheme): ResolvedTheme {
  return choice === 'system' ? system : choice;
}

/** Sets `data-theme` on `<html>`, which switches the token values. */
export function applyTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement) {
  if (root.getAttribute('data-theme') !== theme) root.setAttribute('data-theme', theme);
}
