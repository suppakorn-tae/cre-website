import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import common from '../../../../messages/th/common.json';
import adminAudit from '../../../../messages/th/admin-audit.json';
import ui from '../../../../messages/th/ui.json';

import { AuditFilters } from './AuditFilters';
import { formatValue } from './AuditDetail';
import { AUDIT_ACTIONS, EMPTY_FILTERS, TARGET_TYPES } from './filters';
import { filterEntries, mockEntries, MOCK_ENTRY_COUNT } from './mocks';

const render = (values = EMPTY_FILTERS) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ 'admin-audit': adminAudit, common, ui }}>
      <QueryClientProvider client={new QueryClient()}>
        <AuditFilters values={values} onChange={() => {}} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );

describe('AuditFilters', () => {
  it('shows every filter of the spec with Thai labels', () => {
    const html = render();
    for (const text of ['ผู้ดูแลระบบ', 'การกระทำ', 'ประเภทเป้าหมาย', 'รหัสเป้าหมาย', 'ตั้งแต่', 'ถึง']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('ล้างตัวกรอง');
  });

  it('offers a Thai label for every action and target type', () => {
    const html = render();
    for (const action of AUDIT_ACTIONS) expect(html).toContain(adminAudit.actions[action]);
    for (const type of TARGET_TYPES) expect(html).toContain(adminAudit.targets[type]);
  });

  it('shows the clear button and a date error once filters are set', () => {
    const html = render({ ...EMPTY_FILTERS, from: '99/99/2569' });
    expect(html).toContain('ล้างตัวกรอง');
    expect(html).toContain('วันที่ไม่ถูกต้อง');
  });
});

describe('audit view is read-only', () => {
  it('has no edit or delete wording in the catalogue', () => {
    const text = JSON.stringify(adminAudit);
    expect(text).not.toContain('ลบรายการ');
    expect(text).not.toContain('แก้ไขรายการ');
  });

  it('formats old and new values', () => {
    expect(formatValue(null)).toBeNull();
    expect(formatValue({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatValue('x')).toBe('x');
  });
});

describe('mock audit api', () => {
  it('lists newest first and filters by action, admin and range', () => {
    expect(mockEntries).toHaveLength(MOCK_ENTRY_COUNT);
    expect(mockEntries[0].id).toBeGreaterThan(mockEntries[1].id);
    const byAction = filterEntries(mockEntries, new URLSearchParams({ action: 'advice_edit' }));
    expect(byAction.length).toBeGreaterThan(0);
    expect(byAction.every((e) => e.action === 'advice_edit')).toBe(true);
    const sample = mockEntries[5];
    const range = filterEntries(
      mockEntries,
      new URLSearchParams({
        from: sample.occurred_at,
        to: new Date(Date.parse(sample.occurred_at) + 1000).toISOString(),
      }),
    );
    expect(range.map((e) => e.id)).toEqual([sample.id]);
  });

  it('keeps an entry of an anonymised admin with its admin id', () => {
    const gone = mockEntries.find((e) => e.admin_email === null);
    expect(gone?.admin_id).toBeTruthy();
  });
});
