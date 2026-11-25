import { describe, expect, it } from 'vitest';

import {
  emptyForm,
  fromProject,
  parseBaht,
  toPayload,
  validateForm,
  type FormValues,
  type Project,
} from './validation';

const valid: FormValues = {
  name: 'ท่าเรือเกาะเต่า ระยะที่ 2',
  nickname: 'TK2',
  islandCode: 'koh_tao',
  islandOther: '',
  typeCode: 'pier',
  typeOther: '',
  startDate: '01/12/2568',
  endDate: '30/11/2570',
  value: '48,500,000',
  progress: '45',
  description: '',
};

describe('validateForm', () => {
  it('accepts the hi-fi example', () => {
    expect(validateForm(valid)).toEqual({});
  });

  it('requires every mandatory field', () => {
    const errors = validateForm({ ...emptyForm });
    expect(Object.keys(errors).sort()).toEqual(
      ['endDate', 'islandCode', 'name', 'nickname', 'startDate', 'typeCode', 'value'].sort(),
    );
  });

  it('keeps the nickname to 3-4 characters', () => {
    expect(validateForm({ ...valid, nickname: 'TK' }).nickname).toBe('nicknameLength');
    expect(validateForm({ ...valid, nickname: 'TK234' }).nickname).toBe('nicknameLength');
    expect(validateForm({ ...valid, nickname: 'เต่า1' }).nickname).toBeUndefined();
    expect(validateForm({ ...valid, nickname: '   ' }).nickname).toBe('nicknameRequired');
  });

  it('needs text for other island and other type', () => {
    const errors = validateForm({ ...valid, islandCode: 'other', typeCode: 'other' });
    expect(errors.islandOther).toBe('islandOtherRequired');
    expect(errors.typeOther).toBe('typeOtherRequired');
    expect(
      validateForm({ ...valid, islandCode: 'other', islandOther: 'เกาะหมาก' }).islandOther,
    ).toBeUndefined();
  });

  it('puts the end date after the start date', () => {
    expect(validateForm({ ...valid, endDate: '01/12/2568' }).endDate).toBe('endBeforeStart');
    expect(validateForm({ ...valid, endDate: '31/02/2570' }).endDate).toBe('dateInvalid');
  });

  it('needs a value above zero', () => {
    expect(validateForm({ ...valid, value: '0' }).value).toBe('valuePositive');
    expect(validateForm({ ...valid, value: 'abc' }).value).toBe('valueInvalid');
  });

  it('limits progress to 0-100 and defaults an empty field to 0', () => {
    expect(validateForm({ ...valid, progress: '101' }).progress).toBe('progressRange');
    expect(validateForm({ ...valid, progress: '-1' }).progress).toBe('progressRange');
    expect(validateForm({ ...valid, progress: '' }).progress).toBeUndefined();
    expect(toPayload({ ...valid, progress: '' }).progress_pct).toBe(0);
  });
});

describe('toPayload', () => {
  it('builds the request body with ISO dates and numbers', () => {
    expect(toPayload({ ...valid, description: '  ขยายท่าเทียบเรือ ' })).toEqual({
      name: 'ท่าเรือเกาะเต่า ระยะที่ 2',
      nickname: 'TK2',
      island_code: 'koh_tao',
      island_other: null,
      type_code: 'pier',
      type_other: null,
      start_date: '2025-12-01',
      end_date: '2027-11-30',
      value_baht: 48_500_000,
      progress_pct: 45,
      description: 'ขยายท่าเทียบเรือ',
    });
  });

  it('sends other text only with the other code', () => {
    const body = toPayload({
      ...valid,
      islandCode: 'other',
      islandOther: 'เกาะหมาก',
      typeOther: 'ignored',
    });
    expect(body.island_other).toBe('เกาะหมาก');
    expect(body.type_other).toBeNull();
  });
});

describe('fromProject', () => {
  it('round-trips through the form', () => {
    const project = {
      id: '0193a5c2-7b1e-7c3a-9d4f-2a6b8e1f5c71',
      ...toPayload(valid),
      expected_progress_pct: 48,
      version_count: 2,
      latest_version_no: 2,
      latest_version_id: '0193a5c2-7b1e-7c3a-9d4f-2a6b8e1f5c72',
      created_at: '2026-11-20T03:14:07Z',
      updated_at: '2026-11-20T03:14:07Z',
    } as Project;
    expect(fromProject(project)).toEqual({ ...valid, value: '48500000' });
  });
});

describe('parseBaht', () => {
  it('reads commas and satang', () => {
    expect(parseBaht('1,234.50')).toBe(1234.5);
    expect(parseBaht('1.234')).toBeNull();
  });
});
