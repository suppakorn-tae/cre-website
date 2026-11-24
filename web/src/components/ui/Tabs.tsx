'use client';

import { useRef, type KeyboardEvent } from 'react';

import styles from './display.module.css';

export type TabItem = { id: string; label: string; count?: number };

type Props = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix for tab and panel ids: tab `${idPrefix}-tab-x`, panel `${idPrefix}-panel-x`. */
  idPrefix: string;
};

/** Tab strip. The caller renders the panel with `role="tabpanel"` and the matching ids. */
export function Tabs({ items, value, onChange, label, idPrefix }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, index: number) {
    const last = items.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={styles.tablist}>
      {items.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
            {t.count !== undefined && <span className={styles.count}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
