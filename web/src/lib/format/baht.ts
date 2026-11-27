/** Grouping of baht amounts while typing (IO-250). Text in, text out; nothing is rounded. */

/** The text without grouping commas and spaces: what is saved and sent to the api. */
export const stripGrouping = (text: string): string => text.replace(/[,\s]/g, '');

const AMOUNT = /^(\d*)(\.\d*)?$/;

/**
 * Groups the integer part in thousands: `1250000.5` becomes `1,250,000.5`. A trailing dot
 * and the decimals are kept as typed. Text that is not a number (letters, two dots) comes
 * back unchanged, so the user sees what they typed together with its error.
 */
export function formatBahtInput(text: string): string {
  const plain = stripGrouping(text);
  const match = AMOUNT.exec(plain);
  if (!match) return text;
  const int = (match[1] ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return int + (match[2] ?? '');
}

/** True when the amount has more than 2 decimals (baht has satang only). */
export const hasTooManyDecimals = (text: string): boolean => /\.\d{3,}$/.test(stripGrouping(text));

/** Caret in `formatted` that has the same number of digits (and dot) before it as `caret` in `typed`. */
export function caretAfterFormat(typed: string, caret: number, formatted: string): number {
  let remaining = stripGrouping(typed.slice(0, caret)).length;
  let pos = 0;
  while (pos < formatted.length && remaining > 0) {
    if (formatted[pos] !== ',') remaining -= 1;
    pos += 1;
  }
  return pos;
}

/**
 * Backspace (`forward` false) or Delete (`forward` true) next to a grouping comma removes
 * the digit on the other side of it, as the comma is not something the user typed. Returns
 * null when the key needs no special handling.
 */
export function deleteAcrossComma(
  text: string,
  caret: number,
  forward: boolean,
): { text: string; caret: number } | null {
  const commaAt = forward ? caret : caret - 1;
  if (text[commaAt] !== ',') return null;
  const digitAt = forward ? commaAt + 1 : commaAt - 1;
  if (digitAt < 0 || digitAt >= text.length) return null;
  const raw = text.slice(0, digitAt) + text.slice(digitAt + 1);
  const rawCaret = forward ? caret : caret - 1;
  const formatted = formatBahtInput(raw);
  return { text: formatted, caret: caretAfterFormat(raw, rawCaret, formatted) };
}
