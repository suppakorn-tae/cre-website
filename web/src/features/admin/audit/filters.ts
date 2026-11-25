import type { components } from '@/lib/api/generated/schema';

export type AuditAction = components['schemas']['AuditAction'];

export const AUDIT_ACTIONS: AuditAction[] = [
  'user_role_change',
  'user_deactivate',
  'user_reactivate',
  'user_delete',
  'advice_edit',
  'rl_threshold_edit',
  'impact_table_edit',
  'export_request',
  'export_download',
];

/** Target types the api writes today (`target_type` is an open string in the contract). */
export const TARGET_TYPES = ['account', 'indicator', 'impact_table', 'job'] as const;

/** Filter form values; dates stay as the typed text (dd/mm/yyyy in the Buddhist era). */
export type FilterValues = {
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  from: string;
  to: string;
};

export const EMPTY_FILTERS: FilterValues = {
  adminId: '',
  action: '',
  targetType: '',
  targetId: '',
  from: '',
  to: '',
};

/** What the api is asked, taken from the filters once they are valid. */
export type AuditQuery = {
  admin_id?: string;
  action?: AuditAction;
  target_type?: string;
  target_id?: string;
  from?: string;
  to?: string;
};

const BUDDHIST_OFFSET = 543;
const MS_PER_DAY = 86_400_000;
const BANGKOK_OFFSET_HOURS = 7;

/** `dd/mm/yyyy` in the Buddhist era (a Common Era year also works) to an ISO date, or null. */
export function parseBuddhistDate(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const typed = Number(match[3]);
  const year = typed > 2400 ? typed - BUDDHIST_OFFSET : typed;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return probe.toISOString().slice(0, 10);
}

/** Midnight Bangkok time of an ISO date, `daysAfter` days later, as a UTC instant. */
function bangkokMidnight(iso: string, daysAfter = 0): string {
  const [y, m, d] = iso.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d) + daysAfter * MS_PER_DAY - BANGKOK_OFFSET_HOURS * 3_600_000;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export type DateProblem = 'from' | 'to' | 'range' | null;

/** Which date field is wrong, if any. Empty dates are fine. */
export function dateProblem(values: Pick<FilterValues, 'from' | 'to'>): DateProblem {
  const from = values.from.trim() ? parseBuddhistDate(values.from) : undefined;
  const to = values.to.trim() ? parseBuddhistDate(values.to) : undefined;
  if (from === null) return 'from';
  if (to === null) return 'to';
  if (from && to && to < from) return 'range';
  return null;
}

/**
 * Query for the api. The end date is inclusive for the user, while `to` is
 * exclusive in the contract, so it becomes midnight of the next day.
 * Returns null while a date is invalid.
 */
export function toAuditQuery(values: FilterValues): AuditQuery | null {
  if (dateProblem(values) !== null) return null;
  const query: AuditQuery = {};
  if (values.adminId) query.admin_id = values.adminId;
  if (values.action) query.action = values.action as AuditAction;
  if (values.targetType) {
    query.target_type = values.targetType;
    if (values.targetId.trim()) query.target_id = values.targetId.trim();
  }
  const from = values.from.trim() ? parseBuddhistDate(values.from) : null;
  const to = values.to.trim() ? parseBuddhistDate(values.to) : null;
  if (from) query.from = bangkokMidnight(from);
  if (to) query.to = bangkokMidnight(to, 1);
  return query;
}

export function hasFilters(values: FilterValues): boolean {
  return Object.values(values).some((v) => v.trim() !== '');
}
