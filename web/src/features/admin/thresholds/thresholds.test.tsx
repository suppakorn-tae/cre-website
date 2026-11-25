import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import adminThresholds from '../../../../messages/th/admin-thresholds.json';
import ui from '../../../../messages/th/ui.json';
import { createApiClient } from '@/lib/api/client';

import { saveErrorKey } from './api';
import { ImpactForm } from './ImpactTables';
import { ImpactPage } from './ImpactPage';
import { ThresholdsPage } from './ThresholdsPage';
import {
  adminThresholdHandlers,
  getImpactStore,
  getRlStore,
  resetThresholdStore,
  setDirection,
} from './mocks';
import { RlRow } from './RlRow';
import {
  activeSlots,
  checkImpact,
  checkRl,
  parseDraft,
  parseValue,
  type Parsed,
} from './validation';

const p = (
  a: number | null,
  b: number | null,
  c: number | null,
  d: number | null,
  e: number | null,
): Parsed => ({ a, b, c, d, e });

describe('parsing', () => {
  it('keeps blanks as null and flags anything that is not a plain number', () => {
    expect(parseValue('  ')).toBeNull();
    expect(parseValue('4.25')).toBe(4.25);
    expect(parseValue('1e3')).toBeNaN();
    expect(parseValue('abc')).toBeNaN();
    expect(parseDraft({ a: '1', b: '', c: 'x', d: '', e: '' })).toMatchObject({ a: 1, b: null });
  });
});

describe('RL rules mirror the api', () => {
  it('accepts a..e, a..c and c..e that increase', () => {
    expect(checkRl('normal', p(1, 2, 3, 4, 5))).toEqual({ fields: {} });
    expect(checkRl('normal', p(1, 2, 3, null, null))).toEqual({ fields: {} });
    expect(checkRl('normal', p(null, null, 3, 4, 5))).toEqual({ fields: {} });
  });

  it('rejects any other pattern', () => {
    for (const v of [
      p(1, 2, null, 4, 5),
      p(1, 2, 3, 4, null),
      p(null, 2, 3, 4, 5),
      p(null, null, null, null, null),
    ]) {
      expect(checkRl('normal', v).form).toBe('pattern');
    }
  });

  it('needs strictly increasing, or strictly decreasing when inverse', () => {
    expect(checkRl('normal', p(1, 2, 2, 4, 5)).form).toBe('order');
    expect(checkRl('normal', p(5, 4, 3, 2, 1)).form).toBe('order');
    expect(checkRl('inverse', p(5, 4, 3, 2, 1))).toEqual({ fields: {} });
    expect(checkRl('inverse', p(1, 2, 3, 4, 5)).form).toBe('order');
    expect(checkRl('inverse', p(9.33, 8.67, 5.88, 6.2, 2.58)).form).toBe('order');
  });

  it('flags negative and non-numeric slots on the slot itself', () => {
    expect(checkRl('normal', p(-1, 2, 3, 4, 5)).fields).toEqual({ a: 'negative' });
    expect(checkRl('normal', p(Number.NaN, 2, 3, 4, 5)).fields).toEqual({ a: 'invalid' });
    expect(checkRl('normal', p(0, 2, 3, 4, 5))).toEqual({ fields: {} });
  });

  it('shows only the fields an indicator uses', () => {
    expect(activeSlots(p(1, 2, 3, null, null))).toEqual(['a', 'b', 'c']);
    expect(activeSlots(p(null, null, 3, 4, 5))).toEqual(['c', 'd', 'e']);
    expect(activeSlots(p(1, 2, 3, 4, 5))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('impact rules mirror the api', () => {
  it('needs all five, not negative, strictly increasing', () => {
    expect(checkImpact(p(1, 2, 3, 4, 5))).toEqual({ fields: {} });
    expect(checkImpact(p(1, 2, 3, 4, null)).fields).toEqual({ e: 'required' });
    expect(checkImpact(p(-1, 2, 3, 4, 5)).fields).toEqual({ a: 'negative' });
    expect(checkImpact(p(1, 2, 2, 4, 5)).form).toBe('order');
  });
});

describe('save failures', () => {
  it('maps to catalogue keys without leaking developer text', () => {
    expect(saveErrorKey(new TypeError('fetch failed'))).toBe('network');
    expect(saveErrorKey(new Error('x'))).toBe('unknown');
  });
});

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ 'admin-thresholds': adminThresholds, ui }}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );

const noop = () => {};

describe('RlRow', () => {
  const base = getRlStore().find((r) => r.indicator_code === 'EC-HS-2')!;

  it('shows a Thai direction label and hides unused fields of an a..c indicator', () => {
    const html = wrap(
      <table>
        <tbody>
          <RlRow
            row={base}
            name="x"
            editing={false}
            busy={false}
            onEdit={noop}
            onCancel={noop}
            onSave={noop}
          />
        </tbody>
      </table>,
    );
    expect(html).toContain('ปกติ ↑');
    expect(html).toContain('แก้ไข');
    expect(html.match(/<td[^>]*hidden/g)).toHaveLength(2);
  });

  it('shows inputs with Thai labels when editing and the inverse label', () => {
    const html = wrap(
      <table>
        <tbody>
          <RlRow
            row={{ ...base, direction: 'inverse' }}
            name="x"
            editing
            busy={false}
            serverError="ข้อความจากเซิร์ฟเวอร์"
            onEdit={noop}
            onCancel={noop}
            onSave={noop}
          />
        </tbody>
      </table>,
    );
    expect(html).toContain('ผกผัน ↓');
    expect(html).toContain('เกณฑ์ a ของ EC-HS-2');
    expect(html).toContain('ข้อความจากเซิร์ฟเวอร์');
    expect(html).toContain('ยกเลิก');
  });
});

describe('ImpactForm', () => {
  it('renders RIC and RIT side by side with their values, rule and one save', () => {
    const html = wrap(<ImpactForm stored={getImpactStore()} />);
    for (const text of [
      'RIC · ผลกระทบด้านต้นทุน',
      'RIT · ผลกระทบด้านเวลา',
      'ต้องครบ 5 ค่า ไม่ติดลบ และเพิ่มขึ้นอย่างเคร่งครัด',
      'บันทึกการเปลี่ยนแปลง',
      'ยกเลิก',
      'value="9.58"',
      'value="79.33"',
    ]) {
      expect(html).toContain(text);
    }
    expect(html.match(/type="submit"/g)).toHaveLength(1);
  });
});

const server = setupServer(...adminThresholdHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => resetThresholdStore());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createApiClient({ baseUrl: 'http://localhost/api/v1', fetch: (r) => fetch(r) });

describe('page split', () => {
  const page = (node: React.ReactNode) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{ 'admin-thresholds': adminThresholds, ui }}>
        <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
      </NextIntlClientProvider>,
    );

  it('serves the impact tables on their own page, not on the RL page', () => {
    expect(page(<ImpactPage />)).toContain('ตารางกลางที่ใช้ร่วมกัน');
    expect(page(<ThresholdsPage />)).not.toContain('ตารางกลางที่ใช้ร่วมกัน');
  });
});

describe('admin thresholds against the MSW mocks', () => {
  it('lists the 55 indicators and saves a valid edit', async () => {
    const list = await api.GET('/admin/rl-thresholds');
    expect(list.data!.items).toHaveLength(55);
    const saved = await api.PUT('/admin/rl-thresholds/{indicator_code}', {
      params: { path: { indicator_code: 'EC-MG-1' } },
      body: { thresholds: { a: 1, b: 2, c: 3, d: 4, e: 5 } },
    });
    expect(saved.data!.thresholds.e).toBe(5);
    expect(getRlStore().find((r) => r.indicator_code === 'EC-MG-1')!.thresholds.a).toBe(1);
  });

  it('answers 422 for a wrong order, honouring an inverse direction', async () => {
    setDirection('EC-MG-5', 'inverse');
    const put = (thresholds: Parsed) =>
      api.PUT('/admin/rl-thresholds/{indicator_code}', {
        params: { path: { indicator_code: 'EC-MG-5' } },
        body: { thresholds: thresholds as never },
      });
    await expect(put(p(1, 2, 3, 4, 5))).rejects.toMatchObject({ status: 422 });
    expect((await put(p(5, 4, 3, 2, 1))).data!.thresholds.a).toBe(5);
  });

  it('replaces both impact tables in one call and rejects a bad one with 422', async () => {
    const ok = await api.PUT('/admin/impact-tables', {
      body: { ri_c: { a: 1, b: 2, c: 3, d: 4, e: 5 }, ri_t: { a: 5, b: 6, c: 7, d: 8, e: 9 } },
    });
    expect(ok.data!.ri_t.thresholds.a).toBe(5);
    expect(getImpactStore().ri_c.thresholds.e).toBe(5);
    await expect(
      api.PUT('/admin/impact-tables', { body: { ri_c: { a: 3, b: 2, c: 3, d: 4, e: 5 } } }),
    ).rejects.toMatchObject({ status: 422 });
    expect(getImpactStore().ri_c.thresholds.a).toBe(1);
  });
});
