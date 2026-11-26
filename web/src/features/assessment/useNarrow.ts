'use client';

import { useSyncExternalStore } from 'react';

/** Below this width the assessment is a list of cards instead of a table. */
const QUERY = '(max-width: 767px)';

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** True on a phone-sized screen. The server and static markup answer false (the table). */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
