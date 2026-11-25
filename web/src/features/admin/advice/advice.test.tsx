import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import common from '../../../../messages/th/common.json';
import adviceMessages from '../../../../messages/th/admin-advice.json';
import ui from '../../../../messages/th/ui.json';

import { AdviceListEditor } from './AdviceListEditor';
import { IndicatorPicker } from './IndicatorPicker';
import { getAdvice, isValidItems, resetAdviceStore } from './mocks';
import { mockCatalogue } from '@/mocks/catalogue';
import { draftFrom, flattenCatalogue, type AdviceItems } from './rules';

const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ 'admin-advice': adviceMessages, common, ui }}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );

const items = (n: number): AdviceItems =>
  Array.from({ length: n }, (_, i) => ({ text: { th: `ข้อ ${i + 1}` } })) as AdviceItems;

const editor = (n: number, list: 'RL' | 'RI_E' = 'RI_E', updatedBy: string | null = null) =>
  wrap(
    <AdviceListEditor
      code="EC-TC-2"
      list={list}
      saved={items(n)}
      updatedAt="2026-11-12T03:00:00Z"
      updatedBy={updatedBy}
      draft={undefined}
      onDraft={() => {}}
    />,
  );

describe('AdviceListEditor', () => {
  it('shows the list as the hi-fi does, with subscripted notation', () => {
    const html = editor(4);
    expect(html).toContain('คำแนะนำด้านสิ่งแวดล้อม');
    expect(html).toContain('RI<sub>E</sub>');
    expect(html).toContain('4 / 5 ข้อ');
    expect(html).toContain('เพิ่มคำแนะนำ (เพิ่มได้อีก 1 ข้อ)');
    expect(html).toContain('บันทึกคำแนะนำ');
    expect(html).toContain('ยกเลิก');
    expect(html).toContain('แก้ไขล่าสุด');
    expect(html).toContain('ย้ายคำแนะนำข้อ 2 ขึ้น');
    expect(html).toContain('ย้ายคำแนะนำข้อ 2 ลง');
    expect(editor(2, 'RL')).toContain('(RL)');
  });

  it('disables the first up and the last down move buttons', () => {
    const html = editor(3);
    expect(html).toMatch(/aria-label="ย้ายคำแนะนำข้อ 1 ขึ้น"[^>]*disabled/);
    expect(html).toMatch(/aria-label="ย้ายคำแนะนำข้อ 3 ลง"[^>]*disabled/);
    expect(html).not.toMatch(/aria-label="ย้ายคำแนะนำข้อ 2 ขึ้น"[^>]*disabled/);
  });

  it('disables add at 5 items', () => {
    const html = editor(5);
    expect(html).toContain('ครบ 5 ข้อแล้ว');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="ครบ 5 ข้อแล้ว"/);
    expect(editor(4)).not.toContain('ครบ 5 ข้อแล้ว');
  });

  it('disables remove at 1 item and keeps it enabled above 1', () => {
    expect(editor(1)).toMatch(/aria-label="ลบคำแนะนำข้อ 1"[^>]*disabled/);
    expect(editor(2)).not.toMatch(/aria-label="ลบคำแนะนำข้อ 1"[^>]*disabled/);
  });

  it('keeps save and cancel disabled until something changes', () => {
    expect(editor(2)).toMatch(/disabled=""[^>]*>บันทึกคำแนะนำ/);
    const html = wrap(
      <AdviceListEditor
        code="EC-TC-2"
        list="RL"
        saved={items(2)}
        updatedAt="2026-11-12T03:00:00Z"
        draft={draftFrom(items(1))}
        onDraft={() => {}}
      />,
    );
    expect(html).not.toMatch(/disabled=""[^>]*>บันทึกคำแนะนำ/);
  });
});

describe('last edited label', () => {
  it('shows the editor e-mail and the date', () => {
    const html = editor(2, 'RL', 'somchai@example.com');
    expect(html).toContain('แก้ไขล่าสุดโดย');
    expect(html).toContain('somchai@example.com');
    expect(html).toContain(' · ');
  });

  it('shows the date only when the list was never edited', () => {
    const html = editor(2, 'RL', null);
    expect(html).toContain('แก้ไขล่าสุด');
    expect(html).not.toContain('แก้ไขล่าสุดโดย');
    expect(html).not.toContain('@');
  });

  it('mock: never edited at first, then the saving admin', () => {
    resetAdviceStore();
    expect(getAdvice('EC-TC-2')!.updated_by).toBeNull();
  });
});

describe('IndicatorPicker', () => {
  it('is one searchable combobox with the chosen indicator in it', () => {
    const html = wrap(
      <IndicatorPicker
        indicators={flattenCatalogue(mockCatalogue)}
        value="EC-TC-2"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('EC-TC-2 · ');
    expect(html).toContain('แสดงรายการตัวชี้วัด');
    // The three selects of the old picker are gone.
    expect(html).not.toContain('<select');
    expect(html).not.toContain('มิติ');
  });
});

describe('mock advice api', () => {
  beforeEach(() => resetAdviceStore());

  it('serves four lists of 1 to 5 items for a catalogue indicator, none for others', () => {
    const advice = getAdvice('EC-TC-2');
    expect(Object.keys(advice!.lists)).toEqual(['RL', 'RI_C', 'RI_T', 'RI_E']);
    for (const list of Object.values(advice!.lists)) {
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(5);
    }
    expect(getAdvice('XX-00-0')).toBeUndefined();
  });

  it('accepts 1 to 5 non-blank Thai items only', () => {
    expect(isValidItems(items(1))).toBe(true);
    expect(isValidItems(items(5))).toBe(true);
    expect(isValidItems([])).toBe(false);
    expect(isValidItems(items(6))).toBe(false);
    expect(isValidItems([{ text: { th: '  ' } }])).toBe(false);
    expect(isValidItems('x')).toBe(false);
  });
});
