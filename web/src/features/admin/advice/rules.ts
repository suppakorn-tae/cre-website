import type { components } from '@/lib/api/generated/schema';

export type AdviceList = components['schemas']['AdviceList'];
export type AdviceItems = components['schemas']['AdminAdviceLists']['lists'][AdviceList];

export const LISTS: AdviceList[] = ['RL', 'RI_C', 'RI_T', 'RI_E'];
export const MIN_ITEMS = 1;
export const MAX_ITEMS = 5;

/** One row being edited. `id` is stable across edits and moves, so rows keep their identity. */
export type DraftItem = { id: number; text: string };
export type Draft = DraftItem[];

let nextId = 1;
const newId = () => nextId++;

/** Saved rows get the ids -1, -2, ...; rows added later get positive ids, so ids never clash. */
export function draftFrom(items: AdviceItems): Draft {
  return items.map((i, n) => ({ id: -(n + 1), text: i.text.th }));
}

/** Request body items: trimmed Thai text, in order. */
export function toItems(draft: Draft): AdviceItems {
  return draft.map((i) => ({ text: { th: i.text.trim() } })) as AdviceItems;
}

export const canAdd = (draft: Draft) => draft.length < MAX_ITEMS;
export const canRemove = (draft: Draft) => draft.length > MIN_ITEMS;

export function addItem(draft: Draft): Draft {
  return canAdd(draft) ? [...draft, { id: newId(), text: '' }] : draft;
}

export function removeItem(draft: Draft, id: number): Draft {
  return canRemove(draft) ? draft.filter((i) => i.id !== id) : draft;
}

export function updateItem(draft: Draft, id: number, text: string): Draft {
  return draft.map((i) => (i.id === id ? { ...i, text } : i));
}

/** Moves the row at `from` to index `to`. Out-of-range or no-op moves return the same array. */
export function moveItem(draft: Draft, from: number, to: number): Draft {
  const inRange = (n: number) => n >= 0 && n < draft.length;
  if (from === to || !inRange(from) || !inRange(to)) return draft;
  const next = [...draft];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

/** Errors by item id. Only blank text is rejected; the length limits are enforced by the buttons. */
export function validate(draft: Draft): Record<number, 'required'> {
  const errors: Record<number, 'required'> = {};
  for (const i of draft) if (i.text.trim() === '') errors[i.id] = 'required';
  return errors;
}

export function isDirty(saved: AdviceItems, draft: Draft): boolean {
  return saved.length !== draft.length || saved.some((s, i) => s.text.th !== draft[i].text.trim());
}

export type FlatIndicator = { code: string; name: string; dimension: string; factor: string };

export type IndicatorFilter = { dimension?: string; factor?: string; q?: string };

type Catalogue = components['schemas']['Catalogue'];

export function flattenCatalogue(catalogue: Catalogue): FlatIndicator[] {
  return catalogue.dimensions.flatMap((d) =>
    d.factors.flatMap((f) =>
      f.indicators.map((i) => ({ code: i.code, name: i.name, dimension: d.code, factor: f.code })),
    ),
  );
}

/** Narrows by dimension, factor and a search over code and name. */
export function filterIndicators(all: FlatIndicator[], f: IndicatorFilter): FlatIndicator[] {
  const q = f.q?.trim().toLowerCase();
  return all.filter(
    (i) =>
      (!f.dimension || i.dimension === f.dimension) &&
      (!f.factor || i.factor === f.factor) &&
      (!q || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)),
  );
}
