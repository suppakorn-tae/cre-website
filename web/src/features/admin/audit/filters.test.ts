import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS, dateProblem, hasFilters, parseBuddhistDate, toAuditQuery } from './filters';

describe('parseBuddhistDate', () => {
  it('reads Buddhist era dates and Common Era dates', () => {
    expect(parseBuddhistDate('01/11/2569')).toBe('2026-11-01');
    expect(parseBuddhistDate('1/1/2026')).toBe('2026-01-01');
  });

  it('rejects text that is not a real date', () => {
    for (const text of ['31/02/2569', '2569-11-01', '01/13/2569', 'abc', '']) {
      expect(parseBuddhistDate(text)).toBeNull();
    }
  });
});

describe('toAuditQuery', () => {
  it('sends nothing for empty filters', () => {
    expect(toAuditQuery(EMPTY_FILTERS)).toEqual({});
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('maps a date range to Bangkok midnights, the end day inclusive', () => {
    const query = toAuditQuery({ ...EMPTY_FILTERS, from: '01/11/2569', to: '15/11/2569' });
    expect(query).toEqual({ from: '2026-10-31T17:00:00Z', to: '2026-11-15T17:00:00Z' });
  });

  it('keeps admin, action and target, and drops target id without a type', () => {
    const query = toAuditQuery({
      ...EMPTY_FILTERS,
      adminId: 'a1',
      action: 'advice_edit',
      targetType: 'indicator',
      targetId: ' EC-HS-1 ',
    });
    expect(query).toEqual({
      admin_id: 'a1',
      action: 'advice_edit',
      target_type: 'indicator',
      target_id: 'EC-HS-1',
    });
    expect(toAuditQuery({ ...EMPTY_FILTERS, targetId: 'x' })).toEqual({});
  });

  it('returns null while a date is wrong, so nothing is requested', () => {
    expect(toAuditQuery({ ...EMPTY_FILTERS, from: '99/99/2569' })).toBeNull();
    expect(dateProblem({ from: '99/99/2569', to: '' })).toBe('from');
    expect(dateProblem({ from: '', to: 'x' })).toBe('to');
    expect(dateProblem({ from: '15/11/2569', to: '01/11/2569' })).toBe('range');
    expect(toAuditQuery({ ...EMPTY_FILTERS, from: '15/11/2569', to: '01/11/2569' })).toBeNull();
  });
});
