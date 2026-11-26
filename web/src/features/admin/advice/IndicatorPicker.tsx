'use client';

import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';

import { Icon } from '@/components/ui';

import styles from './advice.module.css';
import { filterIndicators, type FlatIndicator } from './rules';

type Props = {
  indicators: FlatIndicator[];
  value: string | null;
  onChange: (code: string) => void;
};

const label = (i: FlatIndicator) => `${i.code} · ${i.name}`;

/**
 * One searchable indicator combobox (ARIA APG "editable combobox with list
 * autocomplete"): focus stays in the input, the arrow keys move through the
 * list with aria-activedescendant, Enter picks, Escape closes.
 */
export function IndicatorPicker({ indicators, value, onChange }: Props) {
  const t = useTranslations('admin-advice.picker');
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);

  const current = indicators.find((i) => i.code === value);
  const shown = typing ? filterIndicators(indicators, { q: text }) : indicators;
  const optionId = (code: string) => `${id}-opt-${code}`;
  const activeOption = open ? shown[active] : undefined;

  useEffect(() => {
    if (!activeOption) return;
    document.getElementById(optionId(activeOption.code))?.scrollIntoView({ block: 'nearest' });
    // optionId only depends on the stable id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOption]);

  function show() {
    if (open) return;
    const at = shown.findIndex((i) => i.code === value);
    setActive(at < 0 ? 0 : at);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setTyping(false);
  }

  function pick(item: FlatIndicator) {
    onChange(item.code);
    close();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) show();
      else setActive((a) => Math.min(a + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) show();
      else setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && activeOption) {
        e.preventDefault();
        pick(activeOption);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        close();
      }
    }
  }

  return (
    <div className={styles.picker}>
      <label htmlFor={id} className={styles.pickerLabel}>
        {t('label')}
      </label>
      <div className={styles.combo}>
        <span className={styles.comboIcon}>
          <Icon icon={IconSearch} size={18} />
        </span>
        <input
          id={id}
          type="text"
          role="combobox"
          className={styles.comboInput}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? optionId(activeOption.code) : undefined}
          autoComplete="off"
          placeholder={t('placeholder')}
          value={typing ? text : current ? label(current) : ''}
          onChange={(e) => {
            setText(e.target.value);
            setTyping(true);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => e.target.select()}
          onClick={show}
          onKeyDown={onKeyDown}
          onBlur={close}
        />
        <button
          type="button"
          tabIndex={-1}
          className={styles.comboToggle}
          aria-label={t('toggle')}
          aria-expanded={open}
          aria-controls={listId}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            if (open) close();
            else {
              show();
              e.currentTarget.parentElement?.querySelector('input')?.focus();
            }
          }}
        >
          <Icon icon={IconChevronDown} size={18} />
        </button>
        {open && (
          <div className={styles.comboPopup}>
            <ul id={listId} role="listbox" aria-label={t('label')} className={styles.options}>
              {shown.map((i, n) => (
                <li
                  key={i.code}
                  id={optionId(i.code)}
                  role="option"
                  aria-selected={i.code === value}
                  data-active={n === active || undefined}
                  className={styles.option}
                  // Keep focus in the input while the pointer picks.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(i)}
                >
                  <span className={styles.optionCode}>{i.code}</span>
                  <span className={styles.optionName}>{i.name}</span>
                </li>
              ))}
            </ul>
            {shown.length === 0 && <p className={styles.noMatch}>{t('noMatch')}</p>}
          </div>
        )}
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {open && shown.length > 0 ? t('matches', { n: shown.length }) : ''}
      </p>
    </div>
  );
}
