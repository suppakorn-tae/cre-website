/**
 * Every foreground / background colour pair the UI draws, by token name, with the
 * WCAG 2.2 level it must reach. `contrast.test.ts` checks each one and fails for a
 * colour token that is in neither a pair nor `NOT_CHECKED`, so a new token has to
 * be added here first. The report in docs/a11y/contrast-2026-11.md lists
 * the same table with its ratios.
 */

/** text: 4.5:1 (1.4.3). large: 3:1 for text of 24 px or 18.66 px bold (1.4.3). ui: 3:1 (1.4.11). */
export type PairKind = 'text' | 'large' | 'ui';

export interface Pair {
  kind: PairKind;
  /** Foreground token (without `--`): the text, border, fill or mark. */
  fg: string;
  /** Background token it sits on. */
  bg: string;
  /** Where the UI draws it. */
  use: string;
  /**
   * Set only when the pair is known to miss its ratio and a design decision is open.
   * The text says why it is accepted for now. The test then checks the ratio still
   * misses, so the waiver is removed when the colour is fixed.
   */
  waived?: string;
}

export const REQUIRED: Record<PairKind, number> = { text: 4.5, large: 3, ui: 3 };

/** App backgrounds that carry text and controls. */
export const PAGE_BACKGROUNDS = [
  'color-white',
  'color-surface',
  'color-canvas',
  'color-subtle',
  'color-blue-50',
  'color-disabled-bg',
] as const;

const LEVELS = ['vl', 'l', 'm', 'h', 'vh'] as const;
const DIMS = ['ec', 'so', 'ev'] as const;
const CARDS = ['color-white', 'color-surface'] as const;

function pairs(): Pair[] {
  const out: Pair[] = [];
  const add = (p: Pair) => out.push(p);

  // Body, secondary and muted text on every page background.
  for (const fg of ['color-text', 'color-text-secondary', 'color-text-muted']) {
    for (const bg of PAGE_BACKGROUNDS) {
      add({ kind: 'text', fg, bg, use: 'body, label, table and helper text' });
    }
  }
  add({ kind: 'text', fg: 'color-text', bg: 'color-border', use: 'secondary button pressed' });

  // Links and ghost buttons, tabs, pager, tags.
  for (const bg of ['color-white', 'color-surface', 'color-canvas', 'color-blue-50']) {
    add({ kind: 'text', fg: 'color-blue-600', bg, use: 'link and ghost button text' });
  }
  for (const bg of ['color-blue-50', 'color-blue-100']) {
    add({
      kind: 'text',
      fg: 'color-blue-700',
      bg,
      use: 'selected tab, ghost hover, KPI tag, pager',
    });
  }
  add({ kind: 'text', fg: 'color-blue-700', bg: 'color-white', use: 'selected tab text' });
  for (const bg of ['color-blue-600', 'color-blue-700', 'color-blue-800']) {
    add({ kind: 'text', fg: 'color-white', bg, use: 'primary button, chosen chip, step number' });
  }
  add({ kind: 'text', fg: 'color-white', bg: 'color-navy-900', use: 'tooltip' });
  add({ kind: 'text', fg: 'color-white', bg: 'color-success', use: 'step "ดาวน์โหลดแล้ว" number' });
  add({ kind: 'text', fg: 'color-white', bg: 'level-vh', use: 'destructive button' });
  add({ kind: 'text', fg: 'color-white', bg: 'color-danger-hover', use: 'destructive hover' });
  add({ kind: 'text', fg: 'color-white', bg: 'color-danger-pressed', use: 'destructive pressed' });
  add({ kind: 'text', fg: 'color-white', bg: 'color-error', use: 'filled error mark' });

  // Placeholder, error, helper and status text.
  for (const bg of CARDS) {
    add({ kind: 'text', fg: 'color-placeholder', bg, use: 'input and select placeholder' });
  }
  for (const fg of ['color-error', 'color-success', 'color-warning', 'color-info']) {
    for (const bg of [...CARDS, 'color-canvas']) {
      add({ kind: 'text', fg, bg, use: 'field message, toast icon, step and status text' });
    }
  }
  for (const s of ['success', 'warning', 'error', 'info'] as const) {
    add({ kind: 'text', fg: `color-${s}`, bg: `color-${s}-bg`, use: `${s} chip and alert` });
  }
  add({ kind: 'text', fg: 'color-warning', bg: 'color-orange-50', use: 'orange KPI icon' });
  add({ kind: 'text', fg: 'color-text', bg: 'color-error-bg', use: 'invalid chip' });
  add({ kind: 'text', fg: 'color-text-secondary', bg: 'color-warning-bg', use: 'warning body' });

  // Level chips and labels inside solid bars.
  for (const l of LEVELS) {
    add({ kind: 'text', fg: `level-${l}-text`, bg: `level-${l}-tint`, use: `level ${l} chip` });
    add({
      kind: 'text',
      fg: `level-${l}-text`,
      bg: 'color-white',
      use: `level ${l} text on a card`,
    });
    add({
      kind: 'text',
      fg: `level-${l}-on`,
      bg: `level-${l}`,
      use: `label inside a level ${l} bar`,
    });
  }

  // Dimensions.
  for (const d of DIMS) {
    add({ kind: 'text', fg: `dim-${d}`, bg: 'color-white', use: `dimension ${d} text` });
    add({ kind: 'text', fg: `dim-${d}`, bg: 'color-surface', use: `dimension ${d} text` });
    add({ kind: 'text', fg: `dim-${d}`, bg: `dim-${d}-tint`, use: `dimension ${d} chip` });
    add({
      kind: 'text',
      fg: 'color-text',
      bg: `dim-${d}-tint`,
      use: `dimension ${d} group header`,
    });
    add({ kind: 'ui', fg: `dim-${d}`, bg: 'color-surface', use: `dimension ${d} 4 px side bar` });
    add({ kind: 'ui', fg: `dim-${d}`, bg: `dim-${d}-tint`, use: `dimension ${d} bar on its tint` });
  }

  // Strategy buttons (solid and tint names come from features/plan/strategy.ts).
  add({ kind: 'text', fg: 'color-blue-700', bg: 'color-blue-50', use: 'REDUCE idle' });
  add({ kind: 'text', fg: 'dim-ec', bg: 'dim-ec-tint', use: 'AVOID idle (reuses the EC violet)' });
  add({ kind: 'text', fg: 'color-warning', bg: 'color-warning-bg', use: 'TRANSFER idle' });
  add({ kind: 'text', fg: 'color-text-secondary', bg: 'color-subtle', use: 'ACCEPT idle' });
  for (const s of ['color-blue-700', 'dim-ec', 'color-warning', 'color-text-secondary']) {
    add({ kind: 'text', fg: 'color-white', bg: s, use: 'strategy chosen' });
    add({ kind: 'ui', fg: s, bg: 'color-surface', use: 'strategy border' });
  }

  // Large text: KPI numbers and the bold chart value labels.
  add({ kind: 'large', fg: 'color-text', bg: 'color-surface', use: 'KPI number' });
  add({ kind: 'large', fg: 'color-text', bg: 'color-white', use: 'KPI number, selected' });
  add({ kind: 'large', fg: 'color-text', bg: 'color-white', use: 'donut centre value' });

  // Non-text: control boundaries and states.
  for (const bg of [...CARDS, 'color-canvas']) {
    add({
      kind: 'ui',
      fg: 'color-field-border',
      bg,
      use: 'input, select, checkbox, radio, chip border',
    });
    add({ kind: 'ui', fg: 'color-error', bg, use: 'invalid input border' });
    add({ kind: 'ui', fg: 'color-success', bg, use: 'valid input border' });
    add({ kind: 'ui', fg: 'color-blue-600', bg, use: 'focus ring, tab indicator, checked box' });
    add({ kind: 'ui', fg: 'color-text-muted', bg, use: 'input hover border' });
  }
  add({
    kind: 'ui',
    fg: 'color-field-border',
    bg: 'color-disabled-bg',
    use: 'segmented control edge',
  });
  add({ kind: 'ui', fg: 'color-white', bg: 'color-blue-600', use: 'focus ring gap and checkmark' });
  add({
    kind: 'ui',
    fg: 'color-blue-600',
    bg: 'color-blue-50',
    use: 'selected option, pager edge',
  });
  add({
    kind: 'ui',
    fg: 'color-blue-600',
    bg: 'color-border',
    use: 'selected tab edge, current progress step',
  });
  add({
    kind: 'ui',
    fg: 'color-blue-400',
    bg: 'color-white',
    use: 'done progress step',
  });
  add({
    kind: 'ui',
    fg: 'color-blue-400',
    bg: 'color-white',
    use: 'KPI hover border, compare series',
  });
  add({
    kind: 'ui',
    fg: 'color-blue-600',
    bg: 'color-white',
    use: 'slider range and thumb border',
  });
  add({
    kind: 'ui',
    fg: 'color-field-border',
    bg: 'color-white',
    use: 'slider track edge (1 px border on the blue-100 fill)',
  });
  add({
    kind: 'ui',
    fg: 'color-field-border',
    bg: 'color-surface',
    use: 'progress track (steps not yet done)',
  });
  for (const s of ['success', 'error', 'info', 'warning']) {
    add({ kind: 'ui', fg: `color-${s}`, bg: 'color-white', use: `toast ${s} edge and icon` });
  }

  // Chart bars, donut segments and legend dots against the card.
  for (const l of LEVELS) {
    for (const bg of CARDS) {
      add({
        kind: 'ui',
        fg: `level-${l}`,
        bg,
        use: `level ${l} bar, donut segment, legend dot`,
      });
    }
  }

  return out;
}

export const PAIRS: readonly Pair[] = pairs();

/**
 * Colour tokens that are not a foreground or a background of the pairs above, each
 * with the reason. A decorative or inactive colour is not covered by 1.4.3 or 1.4.11.
 */
export const NOT_CHECKED: Readonly<Record<string, string>> = {
  'color-blue-200': 'Decorative: hover and pressed fills, no text.',
  'color-orange-500': 'Accent mark, never carries text or a boundary.',
  'color-divider': 'Decorative row separator.',
  'color-disabled': 'Inactive component text and the stepper connector are exempt (1.4.3, 1.4.11).',
  'color-success-border': 'Decorative edge of a chip that also has its background and text.',
  'color-warning-border': 'Decorative edge of a chip that also has its background and text.',
  'color-error-border': 'Decorative edge of a chip that also has its background and text.',
  'color-info-border': 'Decorative edge of a chip that also has its background and text.',
};
