import { useState } from 'react';

/** Codes of the dimensions and of the factors the user folded. */
export type Collapsed = { dimensions: string[]; factors: string[] };

export const NONE_COLLAPSED: Collapsed = { dimensions: [], factors: [] };

const toggled = (list: string[], code: string) =>
  list.includes(code) ? list.filter((c) => c !== code) : [...list, code];

export const toggleDimension = (c: Collapsed, code: string): Collapsed => ({
  ...c,
  dimensions: toggled(c.dimensions, code),
});

export const toggleFactor = (c: Collapsed, code: string): Collapsed => ({
  ...c,
  factors: toggled(c.factors, code),
});

export const isDimensionOpen = (c: Collapsed, dimension: string) =>
  !c.dimensions.includes(dimension);

/**
 * A factor shows its rows only when its dimension is open (parent first) and it is open itself.
 * A factor's own state is kept while its dimension is folded, so opening the dimension again
 * brings back each factor as the user left it.
 */
export const isFactorOpen = (c: Collapsed, dimension: string, factor: string) =>
  isDimensionOpen(c, dimension) && !c.factors.includes(factor);

const storageKey = (versionId: string) => `assessment-collapsed:${versionId}`;

function load(versionId: string): Collapsed {
  try {
    const raw = window.sessionStorage.getItem(storageKey(versionId));
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const { dimensions, factors } = parsed as Partial<Collapsed>;
      const strings = (v: unknown) =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      return { dimensions: strings(dimensions), factors: strings(factors) };
    }
  } catch {
    // Storage can be blocked; the page then starts fully open.
  }
  return NONE_COLLAPSED;
}

/** Folded state of the table, kept per version in session storage. */
export function useCollapsed(versionId: string) {
  const [collapsed, setCollapsed] = useState<Collapsed>(() =>
    typeof window === 'undefined' ? NONE_COLLAPSED : load(versionId),
  );
  const update = (next: Collapsed) => {
    setCollapsed(next);
    try {
      window.sessionStorage.setItem(storageKey(versionId), JSON.stringify(next));
    } catch {
      // Not remembered, still works.
    }
  };
  return {
    collapsed,
    toggleDimension: (code: string) => update(toggleDimension(collapsed, code)),
    toggleFactor: (code: string) => update(toggleFactor(collapsed, code)),
  };
}

export type CollapseState = ReturnType<typeof useCollapsed>;
