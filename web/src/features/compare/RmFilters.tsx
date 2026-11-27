'use client';

import * as Popover from '@radix-ui/react-popover';
import { IconChevronDown, IconPlus, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { Button, Icon } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import styles from './compare.module.css';

export type FactorOption = { code: string; name: string };
export type IndicatorOption = { code: string; name: string; factor: string };

const floating =
  'z-50 rounded-card border border-border bg-card text-body text-text shadow-floating';

type FactorProps = {
  /** Every factor of the catalogue, in catalogue order. */
  factors: FactorOption[];
  chosen: string[];
  onChange: (codes: string[]) => void;
};

/** The "ด้าน" filter: removable chips and a button that adds another factor. */
export function FactorFilter({ factors, chosen, onChange }: FactorProps) {
  const t = useTranslations('compare.rm');
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const remaining = factors.filter((f) => !chosen.includes(f.code));
  const nameOf = (code: string) => factors.find((f) => f.code === code)?.name ?? t('unnamed');

  return (
    <div className={styles.filterGroup}>
      <span id={labelId} className={styles.filterLabel}>
        {t('factors')}
      </span>
      <ul aria-labelledby={labelId} className={styles.chips}>
        {chosen.map((code) => (
          <li key={code} className={styles.chip}>
            {nameOf(code)}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={t('removeFactor', { name: nameOf(code) })}
              onClick={() => onChange(chosen.filter((c) => c !== code))}
            >
              <Icon icon={IconX} size={16} />
            </button>
          </li>
        ))}
      </ul>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button
            variant="secondary"
            size="sm"
            icon={<Icon icon={IconPlus} size={16} />}
            disabled={remaining.length === 0}
          >
            {t('addFactor')}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className={`${floating} max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto p-1`}
          >
            {remaining.map((f) => (
              <button
                key={f.code}
                type="button"
                className={styles.menuButton}
                onClick={() => {
                  onChange([...chosen, f.code]);
                  setOpen(false);
                }}
              >
                {f.name}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

type IndicatorProps = {
  /** Indicators of the chosen factors, in catalogue order. */
  options: IndicatorOption[];
  factors: FactorOption[];
  chosen: string[];
  onApply: (codes: string[]) => void;
};

/** The "ตัวชี้วัด" multi-select: a button with the count and a popover of checkboxes (hi-fi 2.5b). */
export function IndicatorFilter({ options, factors, chosen, onApply }: IndicatorProps) {
  const t = useTranslations('compare.rm');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(chosen);
  const [query, setQuery] = useState('');
  const labelId = useId();

  const visible = options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = factors
    .map((f) => ({ factor: f, items: visible.filter((o) => o.factor === f.code) }))
    .filter((g) => g.items.length > 0);
  const toggle = (codes: string[], on: boolean) =>
    setDraft((d) => (on ? [...new Set([...d, ...codes])] : d.filter((c) => !codes.includes(c))));
  const all = visible.map((o) => o.code);

  function change(next: boolean) {
    if (next) {
      setDraft(chosen);
      setQuery('');
    }
    setOpen(next);
  }

  return (
    <div className={styles.filterGroup}>
      <span id={labelId} className={styles.filterLabel}>
        {t('indicators')}
      </span>
      <Popover.Root open={open} onOpenChange={change}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-labelledby={`${labelId} ${labelId}-value`}
            className={styles.pick}
          >
            <span id={`${labelId}-value`}>
              {t('selected', {
                count: formatNumber(chosen.length),
                total: formatNumber(options.length),
              })}
            </span>
            <Icon icon={IconChevronDown} size={18} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            collisionPadding={16}
            className={`${floating} flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[26rem] max-w-[calc(100vw-2rem)] flex-col`}
          >
            <div className="border-b border-divider p-3">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search')}
                aria-label={t('search')}
                className={styles.search}
              />
              <div className={styles.pickAll}>
                <Check
                  label={t('selectAll', { count: formatNumber(all.length) })}
                  checked={all.length > 0 && all.every((c) => draft.includes(c))}
                  indeterminate={
                    all.some((c) => draft.includes(c)) && !all.every((c) => draft.includes(c))
                  }
                  onChange={(on) => toggle(all, on)}
                />
                <button type="button" className={styles.linkButton} onClick={() => setDraft([])}>
                  {t('clear')}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {groups.length === 0 && <p className={styles.noMatch}>{t('noMatch')}</p>}
              {groups.map(({ factor, items }) => {
                const codes = items.map((o) => o.code);
                const count = codes.filter((c) => draft.includes(c)).length;
                return (
                  <div key={factor.code} className={styles.pickGroup}>
                    <Check
                      strong
                      label={`${factor.name} (${formatNumber(count)}/${formatNumber(codes.length)})`}
                      checked={count === codes.length}
                      indeterminate={count > 0 && count < codes.length}
                      onChange={(on) => toggle(codes, on)}
                    />
                    <div className={styles.pickItems}>
                      {items.map((o) => (
                        <Check
                          key={o.code}
                          label={o.name}
                          checked={draft.includes(o.code)}
                          onChange={(on) => toggle([o.code], on)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 border-t border-divider p-3">
              <Popover.Close asChild>
                <Button variant="secondary">{t('cancel')}</Button>
              </Popover.Close>
              <Button
                onClick={() => {
                  onApply(options.filter((o) => draft.includes(o.code)).map((o) => o.code));
                  setOpen(false);
                }}
              >
                {t('apply')}
              </Button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function Check({
  label,
  checked,
  indeterminate = false,
  strong = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  strong?: boolean;
  onChange: (on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className={strong ? styles.checkStrong : styles.check}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
