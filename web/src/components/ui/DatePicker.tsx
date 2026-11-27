'use client';

import * as Popover from '@radix-ui/react-popover';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from '@tabler/icons-react';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { isoToThaiInput, parseThaiDateInput, todayIso } from '@/features/projects/dates';

import styles from './DatePicker.module.css';
import { cx } from './cx';
import { FieldMessage, LabelText, messageIds } from './Field';
import formStyles from './forms.module.css';
import { Icon } from './Icon';

/** Thai locale with the Buddhist-era calendar. Pass `en` (or any locale) later for other languages. */
export const DEFAULT_DATE_LOCALE = 'th-TH-u-ca-buddhist';

export type DatePickerLabels = {
  /** Calendar button when closed, e.g. "เปิดปฏิทิน". */
  open: string;
  /** Name of the calendar dialog, e.g. "เลือกวันที่". */
  calendar: string;
  previousMonth: string;
  nextMonth: string;
  previousYears: string;
  nextYears: string;
  /** Error under the field when the typed or chosen date is outside min / max. */
  outOfRange: string;
};

export type DatePickerProps = {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  /** Text for the optional tag. Leave unset for required fields. */
  optionalLabel?: string;
  /** ISO date (`2026-11-24`), or '' when empty. */
  value: string;
  /** Called with the ISO date, or '' when the typed text is empty or not a real date. */
  onChange: (iso: string) => void;
  /**
   * Called with the raw text of the field on every edit, and with the formatted
   * text after a pick. Lets a form tell an empty field from unreadable text.
   */
  onTextChange?: (text: string) => void;
  /** Earliest ISO date that can be chosen. */
  min?: string;
  /** Latest ISO date that can be chosen. */
  max?: string;
  labels: DatePickerLabels;
  /** Locale for month, weekday and year names. */
  locale?: string;
  /** Placeholder of the text field, e.g. "วว/ดด/ปปปป". */
  placeholder?: string;
  /** Today as an ISO date. Defaults to the Bangkok date; set it in tests. */
  today?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  onBlur?: () => void;
};

/* ISO date helpers. Everything is UTC so a calendar day never shifts. */

function toIso(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m, d));
  const yy = String(date.getUTCFullYear()).padStart(4, '0');
  return `${yy}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  return toIso(y, m, d + n);
}

/** Moves by whole months and keeps the day, or the last day of a shorter month. */
function addMonths(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  const target = new Date(Date.UTC(y, m + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return toIso(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last));
}

/** The day of `iso` moved to year `y`, month `m`, or that month's last day when shorter. */
function inMonth(iso: string, y: number, m: number): string {
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIso(y, m, Math.min(parts(iso)[2], last));
}

function clamp(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

function outside(iso: string, min?: string, max?: string): boolean {
  return Boolean((min && iso < min) || (max && iso > max));
}

function weekdayOf(iso: string): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m, d)).getUTCDay();
}

function monthFirst(y: number, m: number): string {
  return toIso(y, m, 1);
}

/** Weeks of the month of `cursor`, Sunday first; days of other months are null. */
function monthWeeks(cursor: string): (string | null)[][] {
  const [y, m] = parts(cursor);
  const lead = weekdayOf(monthFirst(y, m));
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => toIso(y, m, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

function useFormatters(locale: string) {
  return useMemo(() => {
    const at = (y: number, m: number, d: number) => Date.UTC(y, m, d);
    const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
    const year = new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' });
    const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
    const full = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' });
    const day = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' });
    return {
      monthName: (m: number) => month.format(at(2024, m, 1)),
      // Only the number: the era text ("พ.ศ.") would crowd the heading and the year grid.
      yearName: (y: number) =>
        year.formatToParts(at(y, 5, 1)).find((p) => p.type === 'year')?.value ?? String(y),
      weekdayShort: (i: number) => weekdayShort.format(at(2024, 0, 7 + i)),
      weekdayLong: (i: number) => weekdayLong.format(at(2024, 0, 7 + i)),
      dayName: (iso: string) => day.format(at(...parts(iso))),
      fullDate: (iso: string) => full.format(at(...parts(iso))),
    };
  }, [locale]);
}

type View = 'days' | 'months' | 'years';

type PanelProps = {
  value: string;
  min?: string;
  max?: string;
  today: string;
  labels: DatePickerLabels;
  locale: string;
  onPick: (iso: string) => void;
  id: string;
};

/** The calendar. Mounted only while open, so it starts from the current value each time. */
function CalendarPanel({ value, min, max, today, labels, locale, onPick, id }: PanelProps) {
  const fmt = useFormatters(locale);
  const [cursor, setCursor] = useState(() => clamp(value || today, min, max));
  const [view, setView] = useState<View>('days');
  const [yearStart, setYearStart] = useState(() => parts(clamp(value || today, min, max))[0] - 4);
  const gridRef = useRef<HTMLDivElement>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(true);

  const [cy, cm] = parts(cursor);
  const weeks = useMemo(() => monthWeeks(cursor), [cursor]);

  // Focus follows the cursor while the keyboard drives the grid.
  useEffect(() => {
    if (view !== 'days') {
      // Month and year views: the button that opened them is gone, so land on the current choice.
      if (wantFocus.current) {
        const root = choicesRef.current;
        const choice =
          root?.querySelector<HTMLElement>('[aria-pressed="true"]:not(:disabled)') ??
          root?.querySelector<HTMLElement>('button:not(:disabled)');
        choice?.focus();
        wantFocus.current = false;
      }
      return;
    }
    const cell = gridRef.current?.querySelector<HTMLElement>(`[data-iso="${cursor}"]`);
    if (cell && (wantFocus.current || gridRef.current?.contains(document.activeElement))) {
      cell.focus();
      wantFocus.current = false;
    }
  }, [cursor, view]);

  const go = (next: string) => {
    wantFocus.current = true;
    setCursor(clamp(next, min, max));
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const jump: Record<string, string> = {
      ArrowLeft: addDays(cursor, -1),
      ArrowRight: addDays(cursor, 1),
      ArrowUp: addDays(cursor, -7),
      ArrowDown: addDays(cursor, 7),
      Home: addDays(cursor, -weekdayOf(cursor)),
      End: addDays(cursor, 6 - weekdayOf(cursor)),
      PageUp: addMonths(cursor, e.shiftKey ? -12 : -1),
      PageDown: addMonths(cursor, e.shiftKey ? 12 : 1),
    };
    if (e.key in jump) {
      e.preventDefault();
      go(jump[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!outside(cursor, min, max)) onPick(cursor);
    }
  };

  const monthDisabled = (m: number) => {
    const first = monthFirst(cy, m);
    const last = toIso(cy, m + 1, 0);
    return Boolean((max && first > max) || (min && last < min));
  };
  const yearDisabled = (y: number) =>
    Boolean((max && monthFirst(y, 0) > max) || (min && toIso(y, 11, 31) < min));

  const prevDisabled = Boolean(min && min >= monthFirst(cy, cm));
  const nextDisabled = Boolean(max && monthFirst(cy, cm + 1) > max);

  const headingId = `${id}-heading`;
  const heading =
    view === 'years'
      ? `${fmt.yearName(yearStart)} – ${fmt.yearName(yearStart + 11)}`
      : view === 'months'
        ? fmt.yearName(cy)
        : null;

  const step = (dir: 1 | -1) => {
    // Buttons keep focus: only the keyboard inside the grid moves focus to a day.
    if (view === 'days') setCursor(clamp(addMonths(cursor, dir), min, max));
    else if (view === 'months') setCursor(clamp(addMonths(cursor, 12 * dir), min, max));
    else setYearStart(yearStart + 12 * dir);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.nav}
          aria-label={view === 'years' ? labels.previousYears : labels.previousMonth}
          disabled={view === 'days' && prevDisabled}
          onClick={() => step(-1)}
        >
          <Icon icon={view === 'years' ? IconChevronsLeft : IconChevronLeft} size={18} />
        </button>
        <div id={headingId} className={styles.heading} aria-live="polite">
          {view === 'days' ? (
            <>
              <button
                type="button"
                className={styles.headingButton}
                onClick={() => {
                  wantFocus.current = true;
                  setView('months');
                }}
              >
                {fmt.monthName(cm)}
              </button>
              <button
                type="button"
                className={styles.headingButton}
                onClick={() => {
                  wantFocus.current = true;
                  setYearStart(cy - 4);
                  setView('years');
                }}
              >
                {fmt.yearName(cy)}
              </button>
            </>
          ) : (
            <span className={styles.headingText}>{heading}</span>
          )}
        </div>
        <button
          type="button"
          className={styles.nav}
          aria-label={view === 'years' ? labels.nextYears : labels.nextMonth}
          disabled={view === 'days' && nextDisabled}
          onClick={() => step(1)}
        >
          <Icon icon={view === 'years' ? IconChevronsRight : IconChevronRight} size={18} />
        </button>
      </div>

      {view === 'days' && (
        <div
          ref={gridRef}
          role="grid"
          aria-labelledby={headingId}
          className={styles.grid}
          onKeyDown={onGridKey}
        >
          <div role="row" className={styles.row}>
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                role="columnheader"
                aria-label={fmt.weekdayLong(i)}
                className={styles.weekday}
              >
                {fmt.weekdayShort(i)}
              </div>
            ))}
          </div>
          {weeks.map((week, w) => (
            <div key={w} role="row" className={styles.row}>
              {week.map((iso, i) =>
                iso === null ? (
                  <div key={i} role="gridcell" aria-hidden="true" className={styles.blank} />
                ) : (
                  <div
                    key={iso}
                    role="gridcell"
                    data-iso={iso}
                    tabIndex={iso === cursor ? 0 : -1}
                    aria-label={fmt.fullDate(iso)}
                    aria-selected={iso === value}
                    aria-disabled={outside(iso, min, max) || undefined}
                    aria-current={iso === today ? 'date' : undefined}
                    className={cx(
                      styles.day,
                      iso === today && styles.today,
                      iso === value && styles.selected,
                    )}
                    onClick={() => {
                      setCursor(iso);
                      if (!outside(iso, min, max)) onPick(iso);
                    }}
                  >
                    {fmt.dayName(iso)}
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {view === 'months' && (
        <div ref={choicesRef} className={styles.choices}>
          {Array.from({ length: 12 }, (_, m) => (
            <button
              key={m}
              type="button"
              className={cx(styles.choice, m === cm && styles.selected)}
              disabled={monthDisabled(m)}
              aria-pressed={m === cm}
              onClick={() => {
                wantFocus.current = true;
                setCursor(clamp(inMonth(cursor, cy, m), min, max));
                setView('days');
              }}
            >
              {fmt.monthName(m)}
            </button>
          ))}
        </div>
      )}

      {view === 'years' && (
        <div ref={choicesRef} className={styles.choices}>
          {Array.from({ length: 12 }, (_, i) => {
            const y = yearStart + i;
            return (
              <button
                key={y}
                type="button"
                className={cx(styles.choice, y === cy && styles.selected)}
                disabled={yearDisabled(y)}
                aria-pressed={y === cy}
                onClick={() => {
                  wantFocus.current = true;
                  setCursor(clamp(inMonth(cursor, y, cm), min, max));
                  setView('months');
                }}
              >
                {fmt.yearName(y)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Date field for the Buddhist era: type `dd/mm/yyyy` or pick from a calendar
 * popover. The value is an ISO date. Typing follows features/projects/dates.ts.
 */
export function DatePicker({
  label,
  helper,
  error,
  optionalLabel,
  value,
  onChange,
  onTextChange,
  min,
  max,
  labels,
  locale = DEFAULT_DATE_LOCALE,
  placeholder,
  today,
  id,
  name,
  disabled,
  required,
  className,
  onBlur,
}: DatePickerProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const [text, setText] = useState(() => (value ? isoToThaiInput(value) : ''));
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const todayValue = today ?? todayIso();

  // Follow the value when the parent changes it (a pick, a reset), not while the user types.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if ((parseThaiDateInput(text) ?? '') !== value) setText(value ? isoToThaiInput(value) : '');
  }

  const rangeError = value && outside(value, min, max) ? labels.outOfRange : undefined;
  const shownError = error ?? rangeError;
  const { describedBy } = messageIds(inputId, { helper, error: shownError });

  const pick = (iso: string) => {
    const picked = isoToThaiInput(iso);
    setText(picked);
    onTextChange?.(picked);
    onChange(iso);
    setOpen(false);
  };

  return (
    <div className={cx(formStyles.field, className)}>
      <label htmlFor={inputId} className={formStyles.label}>
        <LabelText required={required} optionalLabel={optionalLabel}>
          {label}
        </LabelText>
      </label>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <div className={formStyles.controlWrap}>
            <input
              id={inputId}
              name={name}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className={cx(formStyles.control, formStyles.hasTrail, styles.input)}
              value={text}
              placeholder={placeholder}
              disabled={disabled}
              required={required}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={describedBy}
              onChange={(e) => {
                setText(e.target.value);
                onTextChange?.(e.target.value);
                onChange(parseThaiDateInput(e.target.value) ?? '');
              }}
              onBlur={onBlur}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && e.altKey && !disabled) {
                  e.preventDefault();
                  setOpen(true);
                }
              }}
            />
            <span className={formStyles.toggleSlot}>
              <button
                ref={buttonRef}
                type="button"
                className={styles.calendarButton}
                aria-label={labels.open}
                aria-haspopup="dialog"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
              >
                <Icon icon={IconCalendar} size={18} />
              </button>
            </span>
          </div>
        </Popover.Anchor>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            aria-label={labels.calendar}
            className={cx(formStyles.popover, styles.popover)}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              buttonRef.current?.focus();
            }}
            onInteractOutside={(e) => {
              if (buttonRef.current?.contains(e.target as Node)) e.preventDefault();
            }}
          >
            <CalendarPanel
              id={`${inputId}-cal`}
              value={value}
              min={min}
              max={max}
              today={todayValue}
              labels={labels}
              locale={locale}
              onPick={pick}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <FieldMessage id={inputId} helper={helper} error={shownError} />
    </div>
  );
}
