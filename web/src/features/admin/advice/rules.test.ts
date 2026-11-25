import { describe, expect, it } from 'vitest';

import {
  MAX_ITEMS,
  MIN_ITEMS,
  addItem,
  canAdd,
  canRemove,
  draftFrom,
  filterIndicators,
  isDirty,
  moveItem,
  removeItem,
  toItems,
  updateItem,
  validate,
  type FlatIndicator,
} from './rules';

const texts = (d: { text: string }[]) => d.map((i) => i.text);
const three = () =>
  draftFrom([{ text: { th: 'ก' } }, { text: { th: 'ข' } }, { text: { th: 'ค' } }]);

describe('limits', () => {
  it('allows 1 to 5 items', () => {
    expect([MIN_ITEMS, MAX_ITEMS]).toEqual([1, 5]);
  });

  it('disables add at 5 and remove at 1', () => {
    let d = three();
    expect(canAdd(d)).toBe(true);
    d = addItem(addItem(d));
    expect(d).toHaveLength(5);
    expect(canAdd(d)).toBe(false);
    expect(addItem(d)).toHaveLength(5);

    const one = draftFrom([{ text: { th: 'ก' } }]);
    expect(canRemove(one)).toBe(false);
    expect(removeItem(one, one[0].id)).toHaveLength(1);
    expect(canRemove(d)).toBe(true);
  });
});

describe('editing', () => {
  it('adds an empty item at the end and removes by id', () => {
    const d = addItem(three());
    expect(texts(d)).toEqual(['ก', 'ข', 'ค', '']);
    expect(texts(removeItem(d, d[1].id))).toEqual(['ก', 'ค', '']);
  });

  it('edits one item without touching the others', () => {
    const d = three();
    expect(texts(updateItem(d, d[1].id, 'ใหม่'))).toEqual(['ก', 'ใหม่', 'ค']);
  });

  it('gives every item a unique id', () => {
    const d = addItem(addItem(three()));
    expect(new Set(d.map((i) => i.id)).size).toBe(5);
  });
});

describe('moveItem', () => {
  it('moves up, down and to any index, keeping ids', () => {
    const d = three();
    expect(texts(moveItem(d, 2, 0))).toEqual(['ค', 'ก', 'ข']);
    expect(texts(moveItem(d, 0, 1))).toEqual(['ข', 'ก', 'ค']);
    expect(moveItem(d, 0, 2).map((i) => i.id)).toEqual([d[1].id, d[2].id, d[0].id]);
  });

  it('ignores moves outside the list or onto itself', () => {
    const d = three();
    expect(moveItem(d, 0, -1)).toBe(d);
    expect(moveItem(d, 2, 3)).toBe(d);
    expect(moveItem(d, 1, 1)).toBe(d);
  });
});

describe('validate and payload', () => {
  it('flags blank items by id', () => {
    let d = addItem(three());
    expect(validate(d)).toEqual({ [d[3].id]: 'required' });
    d = updateItem(d, d[3].id, 'ง');
    expect(validate(d)).toEqual({});
    d = updateItem(d, d[3].id, '   ');
    expect(validate(d)).toEqual({ [d[3].id]: 'required' });
  });

  it('sends trimmed Thai text in order', () => {
    const d = draftFrom([{ text: { th: ' ก ' } }, { text: { th: 'ข' } }]);
    expect(toItems(moveItem(d, 0, 1))).toEqual([{ text: { th: 'ข' } }, { text: { th: 'ก' } }]);
  });

  it('detects changes against the saved list', () => {
    const saved = [{ text: { th: 'ก' } }, { text: { th: 'ข' } }];
    const d = draftFrom(saved);
    expect(isDirty(saved, d)).toBe(false);
    expect(isDirty(saved, moveItem(d, 0, 1))).toBe(true);
    expect(isDirty(saved, updateItem(d, d[0].id, 'ก '))).toBe(false);
    expect(isDirty(saved, addItem(d))).toBe(true);
  });
});

describe('filterIndicators', () => {
  const all: FlatIndicator[] = [
    { code: 'EC-TC-2', name: 'การเปลี่ยนแปลงทางวิศวกรรม', dimension: 'EC', factor: 'EC-TC' },
    { code: 'EC-HS-1', name: 'อุบัติเหตุหน้างาน', dimension: 'EC', factor: 'EC-HS' },
    { code: 'EN-WQ-1', name: 'คุณภาพน้ำทะเล', dimension: 'EN', factor: 'EN-WQ' },
  ];

  it('filters by dimension, factor and search text', () => {
    expect(filterIndicators(all, {}).map((i) => i.code)).toHaveLength(3);
    expect(filterIndicators(all, { dimension: 'EC' }).map((i) => i.code)).toEqual([
      'EC-TC-2',
      'EC-HS-1',
    ]);
    expect(filterIndicators(all, { dimension: 'EC', factor: 'EC-HS' })).toHaveLength(1);
    expect(filterIndicators(all, { q: ' ec-tc ' }).map((i) => i.code)).toEqual(['EC-TC-2']);
    expect(filterIndicators(all, { q: 'น้ำทะเล' }).map((i) => i.code)).toEqual(['EN-WQ-1']);
    expect(filterIndicators(all, { q: 'ไม่มี' })).toHaveLength(0);
  });
});
