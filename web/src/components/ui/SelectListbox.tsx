'use client';

import * as Popover from '@radix-ui/react-popover';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { cx } from './cx';
import styles from './forms.module.css';
import { Icon } from './Icon';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Options with the same group value sit under one header row (keep them adjacent). */
  group?: string;
};

type Entry = { key: string; value: string; label: string; disabled: boolean; isAll: boolean };

const ALL = '\u0000all';

type Shared = {
  options: SelectOption[];
  id?: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
  /** Text of the trigger when nothing is selected. */
  placeholder?: string;
  /** Shorter, semibold trigger for inline use next to a sentence. */
  compact?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
};

export type ListboxProps =
  | (Shared & {
      multiple?: false;
      value: string;
      onChange: (value: string) => void;
    })
  | (Shared & {
      multiple: true;
      value: string[];
      onChange: (value: string[]) => void;
      /** Label of the first row that selects or clears everything, e.g. "ทั้งหมด". */
      allLabel: string;
      /** Trigger text for several (not all) values, e.g. n => `${n} รายการ`. */
      countLabel: (count: number) => string;
    });

/** Index of the next enabled entry from `from` in `step` direction (no wrap), or -1. */
function nextEnabled(entries: Entry[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < entries.length; i += step) {
    if (!entries[i].disabled) return i;
  }
  return -1;
}

/**
 * The picker behind Select and MultiSelect: a combobox-style button and a
 * listbox in a popover. Focus moves into the listbox while it is open and
 * returns to the button when it closes.
 */
export function SelectListbox(props: ListboxProps) {
  const { options, disabled, invalid, describedBy, className, placeholder, compact, name } = props;
  const generated = useId();
  const id = props.id ?? generated;
  const listId = `${id}-list`;
  const multiple = props.multiple === true;
  const allLabel = props.multiple ? props.allLabel : '';
  const selected = useMemo(
    () => new Set(props.multiple ? props.value : [props.value]),
    [props.multiple, props.value],
  );

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = options.map((o) => ({
      key: o.value,
      value: o.value,
      label: o.label,
      disabled: o.disabled === true,
      isAll: false,
    }));
    if (multiple)
      list.unshift({ key: ALL, value: ALL, label: allLabel, disabled: false, isAll: true });
    return list;
  }, [options, multiple, allLabel]);

  const pickable = options.filter((o) => !o.disabled).map((o) => o.value);
  const allSelected = pickable.length > 0 && pickable.every((v) => selected.has(v));

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const isSelected = (e: Entry) => (e.isAll ? allSelected : selected.has(e.value));

  const openList = () => {
    if (disabled) return;
    const firstSelected = entries.findIndex(
      (e) => !e.isAll && !e.disabled && selected.has(e.value),
    );
    const first = entries.findIndex((e) => !e.disabled && !e.isAll);
    setActive(firstSelected >= 0 ? firstSelected : first >= 0 ? first : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, id]);

  const choose = (index: number) => {
    const entry = entries[index];
    if (!entry || entry.disabled) return;
    if (props.multiple) {
      if (entry.isAll) {
        props.onChange(allSelected ? [] : pickable);
      } else {
        const next = new Set(selected);
        if (next.has(entry.value)) next.delete(entry.value);
        else next.add(entry.value);
        // Keep the order of the options, not the order of clicking.
        props.onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
      }
    } else {
      props.onChange(entry.value);
      setOpen(false);
    }
  };

  const move = (to: number) => {
    if (to >= 0) setActive(to);
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(nextEnabled(entries, active, 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        move(nextEnabled(entries, active, -1));
        return;
      case 'Home':
        e.preventDefault();
        move(nextEnabled(entries, -1, 1));
        return;
      case 'End':
        e.preventDefault();
        move(nextEnabled(entries, entries.length, -1));
        return;
      case 'Enter':
        e.preventDefault();
        if (multiple) setOpen(false);
        else choose(active);
        return;
      case ' ':
        if (typed.current.text !== '' && e.timeStamp - typed.current.at < 500) break;
        e.preventDefault();
        choose(active);
        return;
      case 'Tab':
        setOpen(false);
        return;
    }
    // Type-ahead: a printable character jumps to the next label that starts with it.
    if (e.key.length === 1) {
      const now = e.timeStamp;
      const text = (now - typed.current.at < 500 ? typed.current.text : '') + e.key.toLowerCase();
      typed.current = { text, at: now };
      const repeated = text.split('').every((c) => c === text[0]);
      const needle = repeated ? text[0] : text;
      const from = repeated ? active : active - 1;
      const hit = entries
        .map((_, i) => (from + 1 + i + entries.length) % entries.length)
        .find((i) => {
          const entry = entries[i];
          return !entry.disabled && !entry.isAll && entry.label.toLowerCase().startsWith(needle);
        });
      if (hit !== undefined) setActive(hit);
    }
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openList();
    }
  };

  const summary = ((): ReactNode => {
    if (!props.multiple) {
      return options.find((o) => o.value === props.value)?.label ?? null;
    }
    if (selected.size === 0) return null;
    if (allSelected && pickable.length > 1) return `${props.allLabel} (${pickable.length})`;
    if (selected.size === 1) return options.find((o) => selected.has(o.value))?.label ?? null;
    return props.countLabel(selected.size);
  })();

  // Rows grouped under a header; the "all" row and ungrouped options have no header.
  const rows = useMemo(() => {
    const byValue = new Map(options.map((o) => [o.value, o]));
    const out: { header?: string; items: { entry: Entry; index: number }[] }[] = [];
    entries.forEach((entry, index) => {
      const header = entry.isAll ? undefined : byValue.get(entry.value)?.group;
      const last = out[out.length - 1];
      if (last && last.header === header) last.items.push({ entry, index });
      else out.push({ header, items: [{ entry, index }] });
    });
    return out;
  }, [entries, options]);

  const hiddenValues = props.multiple ? props.value : props.value === '' ? [] : [props.value];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span className={cx(styles.controlWrap, className)}>
          <button
            ref={triggerRef}
            id={id}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            aria-label={props['aria-label']}
            aria-labelledby={props['aria-labelledby']}
            disabled={disabled}
            className={cx(
              styles.control,
              styles.hasTrail,
              styles.trigger,
              compact && styles.compact,
            )}
            onClick={() => (open ? setOpen(false) : openList())}
            onKeyDown={onTriggerKeyDown}
          >
            <span className={cx(styles.triggerText, summary === null && styles.placeholder)}>
              {summary ?? placeholder ?? ' '}
            </span>
          </button>
          <span className={cx(styles.trail, open && styles.trailOpen)}>
            <Icon icon={IconChevronDown} size={18} />
          </span>
          {name && hiddenValues.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          role="presentation"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className={styles.popover}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            listRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            triggerRef.current?.focus();
          }}
          onInteractOutside={(e) => {
            // The trigger's own click toggles the list; do not close it twice.
            if (triggerRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-multiselectable={multiple || undefined}
            aria-labelledby={props['aria-labelledby']}
            aria-label={props['aria-label'] ?? (props['aria-labelledby'] ? undefined : placeholder)}
            aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
            className={styles.list}
            onKeyDown={onListKeyDown}
          >
            {rows.map((row, r) => {
              const items = row.items.map(({ entry, index }) => {
                const on = isSelected(entry);
                const partial = entry.isAll && !allSelected && selected.size > 0;
                return (
                  <div
                    key={entry.key}
                    id={`${id}-opt-${index}`}
                    role="option"
                    aria-selected={on}
                    aria-disabled={entry.disabled || undefined}
                    data-active={index === active || undefined}
                    className={cx(styles.option, entry.isAll && styles.optionAll)}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => !entry.disabled && active !== index && setActive(index)}
                    onClick={() => choose(index)}
                  >
                    {multiple && (
                      <span
                        className={cx(styles.box, on && styles.boxOn, partial && styles.boxPartial)}
                        aria-hidden="true"
                      >
                        {on && <Icon icon={IconCheck} size={16} />}
                        {partial && <span className={styles.dash} />}
                      </span>
                    )}
                    <span className={styles.optionText}>{entry.label}</span>
                    {!multiple && on && (
                      <span className={styles.tick} aria-hidden="true">
                        <Icon icon={IconCheck} size={18} />
                      </span>
                    )}
                  </div>
                );
              });
              if (row.header === undefined) return items;
              return (
                <div
                  key={`g${r}`}
                  role="group"
                  aria-labelledby={`${id}-grp-${r}`}
                  className={styles.group}
                >
                  <div id={`${id}-grp-${r}`} className={styles.groupLabel}>
                    {row.header}
                  </div>
                  {items}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
