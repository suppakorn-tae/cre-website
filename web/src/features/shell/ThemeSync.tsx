'use client';

import { useTheme } from '@/lib/theme';

/**
 * Keeps the page following the system theme live. The `prefers-color-scheme`
 * listener of `useTheme()` only lives while a component uses the hook, so each
 * layout (app, admin, auth, legal, error pages) mounts this once. Renders nothing.
 */
export function ThemeSync() {
  useTheme();
  return null;
}
