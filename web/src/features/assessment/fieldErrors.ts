import { ApiError, type FieldError } from '@/lib/api/errors';

/** Part of an indicator card that an error is shown next to. */
export type FieldKey = 'code' | 'x' | 'y1' | 'y2' | 'y3';

/** Server error codes per indicator and field; the value is the error code. */
export type ServerErrors = Record<string, Partial<Record<FieldKey, string>>>;

/** Codes the catalogue has a message for; anything else uses `unknown`. */
export const KNOWN_FIELD_CODES = [
  'out_of_range',
  'invalid_unit',
  'invalid_option',
  'duplicate_option',
  'exclusive_option',
  'invalid_indicator_code',
  'duplicate_indicator',
  'unknown_indicator',
] as const;

const POINTER = /^\/answers\/(\d+)\/(indicator_code|x|y1|y2|y3)(?:\/.*)?$/;

/**
 * Maps the 422 field errors of a PATCH answers batch to indicators. A pointer
 * such as `/answers/2/y1/value` names the third item of the batch, so `codes`
 * must be the indicator codes in the order they were sent. Pointers that match
 * nothing are ignored; the first error of a field wins.
 */
export function mapFieldErrors(codes: string[], fields: FieldError[]): ServerErrors {
  const result: ServerErrors = {};
  for (const { field, code } of fields) {
    const match = POINTER.exec(field);
    const indicator = match ? codes[Number(match[1])] : undefined;
    if (!match || indicator === undefined) continue;
    const key: FieldKey = match[2] === 'indicator_code' ? 'code' : (match[2] as FieldKey);
    const entry = (result[indicator] ??= {});
    entry[key] ??= code;
  }
  return result;
}

/** Field errors of a rejected save, or an empty map for any other failure. */
export function fieldErrorsOf(error: unknown, codes: string[]): ServerErrors {
  return error instanceof ApiError && error.status === 422
    ? mapFieldErrors(codes, error.fields)
    : {};
}

/** Catalogue key of the message for a server error code. */
export function fieldMessageKey(code: string): string {
  return `errors.server.${(KNOWN_FIELD_CODES as readonly string[]).includes(code) ? code : 'unknown'}`;
}
