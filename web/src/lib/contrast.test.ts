import { describe, expect, it } from 'vitest';

import { colourOf, contrast, readTokens, type TokenMap } from './contrast';
import { NOT_CHECKED, PAIRS, REQUIRED, type Pair } from './contrast-pairs';

const tokens = readTokens();

const ratioOf = (map: TokenMap, p: Pair) => contrast(colourOf(map, p.fg), colourOf(map, p.bg));
const label = (p: Pair) => `${p.fg} on ${p.bg} (${p.use})`;

/** The pairs that miss their ratio and are not waived. */
function failures(map: TokenMap): string[] {
  return PAIRS.filter((p) => !p.waived && ratioOf(map, p) < REQUIRED[p.kind]).map(
    (p) => `${label(p)}: ${ratioOf(map, p).toFixed(2)} < ${REQUIRED[p.kind]}`,
  );
}

describe('contrast maths', () => {
  it('matches known values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
  });

  it('reads tokens and follows var() references', () => {
    expect(colourOf(tokens, 'color-white')).toBe('#ffffff');
    expect(colourOf({ a: '#123456', b: 'var(--a)' }, 'b')).toBe('#123456');
    expect(() => colourOf(tokens, 'no-such-token')).toThrow();
  });
});

describe('text and non-text pairs (WCAG 1.4.3 and 1.4.11)', () => {
  it('lists pairs for every kind', () => {
    for (const kind of ['text', 'large', 'ui'] as const) {
      expect(PAIRS.some((p) => p.kind === kind)).toBe(true);
    }
  });

  it('has no pair below its ratio', () => {
    expect(failures(tokens)).toEqual([]);
  });

  it.each(PAIRS.filter((p) => !p.waived).map((p) => [label(p), p] as const))('%s', (_name, p) => {
    expect(ratioOf(tokens, p)).toBeGreaterThanOrEqual(REQUIRED[p.kind]);
  });

  it('still misses the ratio for every waived pair (remove the waiver once it is fixed)', () => {
    for (const p of PAIRS.filter((q) => q.waived)) {
      expect(ratioOf(tokens, p), label(p)).toBeLessThan(REQUIRED[p.kind]);
    }
  });

  it('enforces 3:1 for every risk solid on a card and 4.5:1 for its -on text, with no waiver', () => {
    for (const l of ['vl', 'l', 'm', 'h', 'vh']) {
      const solids = PAIRS.filter((p) => p.fg === `level-${l}`);
      expect(solids.length, l).toBeGreaterThan(0);
      const on = PAIRS.filter((p) => p.fg === `level-${l}-on` && p.bg === `level-${l}`);
      expect(on, l).toHaveLength(1);
      for (const p of [...solids, ...on]) {
        expect(p.waived, label(p)).toBeUndefined();
        expect(ratioOf(tokens, p), label(p)).toBeGreaterThanOrEqual(p.kind === 'ui' ? 3 : 4.5);
      }
    }
  });

  it('fails when a token is changed below its ratio', () => {
    expect(failures({ ...tokens, 'color-placeholder': '#9aa6b6' })).not.toEqual([]);
    expect(failures({ ...tokens, 'color-field-border': '#c8d0dc' })).not.toEqual([]);
    expect(failures({ ...tokens, 'dim-ev-tint': '#0e7490' })).not.toEqual([]);
    expect(failures({ ...tokens, 'level-h-text': '#f97316' })).not.toEqual([]);
  });
});

describe('every colour token is checked', () => {
  const used = new Set(PAIRS.flatMap((p) => [p.fg, p.bg]));
  const colours = Object.entries(tokens)
    .filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v))
    .map(([k]) => k);

  it.each(colours)('--%s is in a pair or has a reason not to be', (name) => {
    expect(used.has(name) || name in NOT_CHECKED, `add --${name} to lib/contrast-pairs.ts`).toBe(
      true,
    );
  });

  it('keeps no stale entries', () => {
    for (const name of [...used, ...Object.keys(NOT_CHECKED)]) {
      expect(colours, `--${name} is not a colour token`).toContain(name);
    }
    for (const name of Object.keys(NOT_CHECKED)) expect(used.has(name), name).toBe(false);
  });
});

describe('dimension colours (hi-fi 00 Foundations, 26 Nov)', () => {
  it('are not the primary blue, the accent orange or a risk level colour', () => {
    const taken = [
      'color-blue-600',
      'color-orange-500',
      ...['vl', 'l', 'm', 'h', 'vh'].map((l) => `level-${l}`),
    ].map((n) => colourOf(tokens, n));
    for (const d of ['ec', 'so', 'ev']) expect(taken).not.toContain(colourOf(tokens, `dim-${d}`));
  });
});
