import type { AnswerInput } from './api';
import { emptyDraft, switchSharedUnit, toInput, type Draft } from './rules';

type Drafts = Record<string, Draft | undefined>;
type UnitField = 'y1' | 'y2';

/** A global unit switch waiting for the user's answer. */
export type PendingSwitch = { field: UnitField; unit: string; count: number };

/**
 * A switch changes the unit of saved amounts without converting them (50 baht
 * becomes 50 %), so ask first when any row with an amount would change. Rows
 * whose amount is invalid in the new unit stay as they are and are not counted.
 */
export function requestUnitSwitch(
  codes: string[],
  drafts: Drafts,
  field: UnitField,
  unit: string,
): { kind: 'apply' } | { kind: 'confirm'; pending: PendingSwitch } {
  const { changed } = switchSharedUnit(codes, drafts, field, unit);
  if (changed.length === 0) return { kind: 'apply' };
  return { kind: 'confirm', pending: { field, unit, count: changed.length } };
}

/** Switches the rows and queues a save for each row with an amount that changed unit. */
export function commitUnitSwitch(
  codes: string[],
  drafts: Drafts,
  field: UnitField,
  unit: string,
  onlyEmpty: boolean,
  queue: (input: AnswerInput) => void,
): { drafts: Drafts; skipped: string[] } {
  const {
    drafts: next,
    changed,
    skipped,
  } = switchSharedUnit(codes, drafts, field, unit, onlyEmpty);
  for (const code of changed) queue(toInput(code, next[code] ?? emptyDraft()));
  return { drafts: next, skipped };
}
