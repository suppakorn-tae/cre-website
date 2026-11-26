import { HttpResponse, http as mswHttp } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client')>();
  const client = original.createApiClient({
    baseUrl: 'http://localhost/api/v1',
    fetch: (input, init) => globalThis.fetch(input, init),
  });
  return { ...original, browserApi: () => client };
});

import { saveAnswers, type AnswerInput } from './api';
import {
  convertAmount,
  durationDays,
  emptyDraft,
  switchSharedUnit,
  type Draft,
  type UnitBasis,
} from './rules';
import { commitUnitSwitch } from './unitSwitch';

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

// 48.5 million baht over 2025-12-01 → 2027-11-30 (729 days).
const basis: UnitBasis = {
  valueBaht: 48_500_000,
  durationDays: durationDays('2025-12-01', '2027-11-30'),
};

describe('convertAmount', () => {
  it('baht → % of the project value, 2 decimals', () => {
    expect(convertAmount(1_200_000, 'percent', basis.valueBaht)).toBe(2.47);
    expect(convertAmount(48_500_000, 'percent', basis.valueBaht)).toBe(100);
    expect(convertAmount(0, 'percent', basis.valueBaht)).toBe(0);
  });
  it('% → whole baht', () => {
    expect(convertAmount(2.47, 'baht', basis.valueBaht)).toBe(1_197_950);
    expect(convertAmount(12.5, 'baht', 1_000_001)).toBe(125_000);
  });
  it('days → % of the project duration, 2 decimals', () => {
    expect(basis.durationDays).toBe(729);
    expect(convertAmount(30, 'percent', basis.durationDays)).toBe(4.12);
    expect(convertAmount(729, 'percent', basis.durationDays)).toBe(100);
  });
  it('% → whole days', () => {
    expect(convertAmount(4.12, 'day', basis.durationDays)).toBe(30);
    expect(convertAmount(50, 'day', basis.durationDays)).toBe(365);
  });
  it('needs a value and a duration above 0', () => {
    expect(convertAmount(10, 'percent', 0)).toBeNull();
    expect(convertAmount(10, 'day', -5)).toBeNull();
  });
});

const codes = ['a', 'b', 'c', 'd'];
const drafts = (): Record<string, Draft | undefined> => ({
  a: { ...emptyDraft(), y1: { amount: '1,200,000', unit: 'baht' } },
  b: { ...emptyDraft(), y1: { amount: '97,000,000', unit: 'baht' } },
  c: { ...emptyDraft(), y1: { amount: 'abc', unit: 'baht' } },
  // d has no amount
});

describe('switchSharedUnit', () => {
  it('converts every filled row and switches blank rows', () => {
    const {
      drafts: next,
      changed,
      skipped,
    } = switchSharedUnit(codes, drafts(), 'y1', 'percent', basis);
    expect(next.a?.y1).toEqual({ amount: '2.47', unit: 'percent' });
    expect(next.d?.y1).toEqual({ amount: '', unit: 'percent' });
    expect(changed).toEqual(['a']);
    // b is 200 % of the value and c is not a number: both keep their unit and value.
    expect(skipped).toEqual(['b', 'c']);
    expect(next.b?.y1).toEqual({ amount: '97,000,000', unit: 'baht' });
  });
  it('converts back from % to whole baht and days', () => {
    const pct = {
      a: {
        ...emptyDraft(),
        y1: { amount: '2.47', unit: 'percent' },
        y2: { amount: '50', unit: 'percent' },
      },
    };
    expect(switchSharedUnit(['a'], pct, 'y1', 'baht', basis).drafts.a?.y1).toEqual({
      amount: '1197950',
      unit: 'baht',
    });
    expect(switchSharedUnit(['a'], pct, 'y2', 'day', basis).drafts.a?.y2).toEqual({
      amount: '365',
      unit: 'day',
    });
  });
  it('keeps typed amounts while the version basis is not loaded', () => {
    const { changed, skipped } = switchSharedUnit(codes, drafts(), 'y1', 'percent');
    expect(changed).toEqual([]);
    expect(skipped).toEqual(['a', 'b', 'c']);
  });
});

describe('commitUnitSwitch', () => {
  it('queues the converted rows only, so one batch is saved', async () => {
    const queued: AnswerInput[] = [];
    commitUnitSwitch(codes, drafts(), 'y1', 'percent', basis, (i) => queued.push(i));
    await saveAnswers('p', 'v', queued);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.answers).toEqual([
      { indicator_code: 'a', y1: { value: 2.47, unit: 'percent' } },
    ]);
  });
  it('queues nothing when the rows already use the unit', () => {
    const queued: AnswerInput[] = [];
    commitUnitSwitch(codes, drafts(), 'y1', 'baht', basis, (i) => queued.push(i));
    expect(queued).toEqual([]);
  });
});
