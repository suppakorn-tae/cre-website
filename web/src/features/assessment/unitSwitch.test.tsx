import { NextIntlClientProvider } from 'next-intl';
import { HttpResponse, http as mswHttp } from 'msw';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import assessment from '../../../messages/th/assessment.json';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client')>();
  const client = original.createApiClient({
    baseUrl: 'http://localhost/api/v1',
    fetch: (input, init) => globalThis.fetch(input, init),
  });
  return { ...original, browserApi: () => client };
});

import { saveAnswers, type AnswerInput } from './api';
import { emptyDraft, switchSharedUnit, toInput, type Draft } from './rules';
import { commitUnitSwitch, requestUnitSwitch } from './unitSwitch';
import { UnitSwitchDialog } from './UnitSwitchDialog';

const patches: { answers: AnswerInput[] }[] = [];
const server = setupServer(
  mswHttp.patch('*/api/v1/projects/:p/versions/:v/answers', async ({ request }) => {
    patches.push((await request.json()) as { answers: AnswerInput[] });
    return HttpResponse.json({ version_id: 'v', editable: true, items: [] });
  }),
);
beforeAll(() => server.listen());
afterEach(() => {
  patches.length = 0;
  server.resetHandlers();
});
afterAll(() => server.close());

const codes = ['a', 'b', 'c', 'd'];
const drafts = (): Record<string, Draft | undefined> => ({
  a: { ...emptyDraft(), y1: { amount: '50', unit: 'baht' } },
  b: { ...emptyDraft(), y1: { amount: '1,200', unit: 'baht' } },
  c: { ...emptyDraft(), y1: { amount: '200,000', unit: 'baht' } },
  // d has no amount
});

/** Queues like the page does, then saves the batch the way autosave flushes it. */
function recorder() {
  const queued: AnswerInput[] = [];
  return {
    queue: (input: AnswerInput) => queued.push(input),
    flush: () => (queued.length > 0 ? saveAnswers('p', 'v', queued) : Promise.resolve()),
    queued,
  };
}

describe('requestUnitSwitch', () => {
  it('asks first and counts the rows with an amount that would change unit', () => {
    const r = requestUnitSwitch(codes, drafts(), 'y1', 'percent');
    // a changes; b (1,200) and c are above 100, so they keep their unit and are not counted.
    expect(r).toEqual({ kind: 'confirm', pending: { field: 'y1', unit: 'percent', count: 1 } });
  });
  it('switches at once when no row with an amount would change', () => {
    const blank = { a: emptyDraft() };
    expect(requestUnitSwitch(codes, blank, 'y1', 'percent')).toEqual({ kind: 'apply' });
    const big = { c: drafts().c };
    expect(requestUnitSwitch(codes, big, 'y1', 'percent')).toEqual({ kind: 'apply' });
  });
  it('does not ask when the rows already use the unit', () => {
    expect(requestUnitSwitch(codes, drafts(), 'y1', 'baht')).toEqual({ kind: 'apply' });
  });
});

describe('commitUnitSwitch', () => {
  it('cancel: nothing is committed, so nothing is queued and no PATCH is sent', async () => {
    const rec = recorder();
    const before = drafts();
    expect(requestUnitSwitch(codes, before, 'y1', 'percent').kind).toBe('confirm');
    // The user cancels: the page drops `pending` and never calls commitUnitSwitch.
    await rec.flush();
    expect(rec.queued).toEqual([]);
    expect(patches).toHaveLength(0);
    expect(before).toEqual(drafts());
  });
  it('confirm: switches every row and saves one answer per changed row', async () => {
    const rec = recorder();
    const res = commitUnitSwitch(codes, drafts(), 'y1', 'percent', false, rec.queue);
    expect(res.drafts.a?.y1).toEqual({ amount: '50', unit: 'percent' });
    expect(res.drafts.d?.y1).toEqual({ amount: '', unit: 'percent' });
    expect(res.skipped).toEqual(['b', 'c']);
    await rec.flush();
    expect(patches).toHaveLength(1);
    expect(patches[0]?.answers).toEqual([
      { indicator_code: 'a', y1: { value: 50, unit: 'percent' } },
    ]);
  });
  it('only empty rows: switches blank rows, leaves amounts and sends no PATCH', async () => {
    const rec = recorder();
    const res = commitUnitSwitch(codes, drafts(), 'y1', 'percent', true, rec.queue);
    expect(res.drafts.d?.y1.unit).toBe('percent');
    expect(res.drafts.a?.y1).toEqual({ amount: '50', unit: 'baht' });
    expect(res.drafts.b?.y1).toEqual({ amount: '1,200', unit: 'baht' });
    expect(res.skipped).toEqual([]);
    await rec.flush();
    expect(rec.queued).toEqual([]);
    expect(patches).toHaveLength(0);
  });
  it('keeps the skip rule for values invalid in the new unit', () => {
    const rec = recorder();
    const res = commitUnitSwitch(codes, drafts(), 'y1', 'percent', false, rec.queue);
    expect(res.drafts.c?.y1).toEqual({ amount: '200,000', unit: 'baht' });
    expect(res.drafts.b?.y1).toEqual({ amount: '1,200', unit: 'baht' });
    expect(rec.queued.map((q) => q.indicator_code)).toEqual(['a']);
  });
});

describe('switchSharedUnit onlyEmpty', () => {
  it('leaves rows with an amount alone, and does not report them as skipped', () => {
    const {
      drafts: next,
      changed,
      skipped,
    } = switchSharedUnit(codes, drafts(), 'y1', 'percent', true);
    expect(changed).toEqual([]);
    expect(skipped).toEqual([]);
    expect(toInput('a', next.a!).y1).toEqual({ value: 50, unit: 'baht' });
  });
});

describe('UnitSwitchDialog', () => {
  const html = () =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{ assessment }}>
        <UnitSwitchDialog
          pending={{ field: 'y1', unit: 'percent', count: 3 }}
          onAll={vi.fn()}
          onEmptyOnly={vi.fn()}
          onCancel={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
  it('says how many saved answers change unit and that the numbers stay', () => {
    const out = html();
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain('3 คำตอบ');
    expect(out).toContain('ตัวเลขยังเท่าเดิม');
  });
  it('offers all rows, only empty rows and cancel', () => {
    const out = html();
    expect(out).toContain('เปลี่ยนทุกแถว');
    expect(out).toContain('เปลี่ยนเฉพาะแถวที่ยังว่าง');
    expect(out).toContain('ยกเลิก');
  });
});
