import type { components } from './generated/schema';

type ErrorBody = components['schemas']['ErrorBody'];
export type FieldError = components['schemas']['FieldError'];

/** Error raised for any non-2xx API answer or a failed request. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  /** Per-field problems of a 422 answer; empty for other errors. */
  readonly fields: FieldError[];

  constructor(
    status: number,
    code: string,
    message: string,
    requestId?: string,
    fields: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.fields = fields;
  }

  static fromBody(status: number, body: unknown): ApiError {
    const error = (body as { error?: Partial<ErrorBody> & { fields?: unknown } } | null)?.error;
    return new ApiError(
      status,
      typeof error?.code === 'string' ? error.code : 'unknown',
      typeof error?.message === 'string' ? error.message : `HTTP ${status}`,
      error?.request_id,
      Array.isArray(error?.fields) ? (error.fields as FieldError[]) : [],
    );
  }
}

const knownCodes = new Set([
  'bad_request',
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'too_many_requests',
]);

export interface ToastMessage {
  /** Key inside the merged Thai catalogue, e.g. `common.errors.not_found`. */
  messageKey: string;
  /** True when the user must sign in again. */
  requiresLogin: boolean;
}

/** Maps any thrown value to a catalogue key; never leaks developer text. */
export function errorToToast(error: unknown): ToastMessage {
  if (error instanceof ApiError) {
    const known = knownCodes.has(error.code);
    return {
      messageKey: `common.errors.${known ? error.code : 'unknown'}`,
      requiresLogin: error.status === 401,
    };
  }
  if (error instanceof TypeError) {
    return { messageKey: 'common.errors.network', requiresLogin: false };
  }
  return { messageKey: 'common.errors.unknown', requiresLogin: false };
}
