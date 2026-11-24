import { defaultLocale, timeZone, type Locale } from '@/lib/i18n/config';

// th: Buddhist era; en: Common Era (architecture, Localisation).
const dateTag: Record<Locale, string> = {
  th: 'th-TH-u-ca-buddhist',
  en: 'en-GB-u-ca-gregory',
};
// Thai UI keeps Arabic numerals.
const numberTag: Record<Locale, string> = { th: 'th-TH-u-nu-latn', en: 'en-GB' };

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

/** 24 พ.ย. 2569 (th) / 24 Nov 2026 (en). Dates are shown in Bangkok time. */
export function formatDate(value: DateInput, locale: Locale = defaultLocale): string {
  return new Intl.DateTimeFormat(dateTag[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(toDate(value));
}

export function formatDateTime(value: DateInput, locale: Locale = defaultLocale): string {
  return new Intl.DateTimeFormat(dateTag[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(toDate(value));
}

/** Grouped number, e.g. 1,234,567.5. */
export function formatNumber(
  value: number,
  locale: Locale = defaultLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(numberTag[locale], options).format(value);
}

/** Baht amount with two decimals, e.g. ฿1,234,567.50. */
export function formatBaht(value: number, locale: Locale = defaultLocale): string {
  return new Intl.NumberFormat(numberTag[locale], {
    style: 'currency',
    currency: 'THB',
  }).format(value);
}
