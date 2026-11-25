import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(tokens);
  if (!m) throw new Error(`colour token --${name} not found`);
  return m[1]!;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// App backgrounds that carry text or controls.
const backgrounds = [
  'color-white',
  'color-surface',
  'color-canvas',
  'color-blue-50',
  'color-subtle',
  'color-disabled-bg',
];

describe('text colours (WCAG 1.4.3, 4.5:1)', () => {
  it.each(['color-text-muted', 'color-text-secondary', 'color-text'])(
    '%s passes on every app background',
    (fg) => {
      for (const bg of backgrounds) {
        expect(contrast(token(fg), token(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});

describe('field border (WCAG 1.4.11 non-text, 3:1)', () => {
  it.each(['color-white', 'color-surface', 'color-canvas'])('passes on %s', (bg) => {
    expect(contrast(token('color-field-border'), token(bg))).toBeGreaterThanOrEqual(3);
  });
});

describe('risk chips use a tint and dark text pair (4.5:1)', () => {
  it.each(['vl', 'l', 'm', 'h', 'vh'])('level %s', (level) => {
    const ratio = contrast(token(`level-${level}-text`), token(`level-${level}-tint`));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('text on a solid level fill, used for labels inside chart bars (4.5:1)', () => {
  it.each(['vl', 'l', 'm', 'h', 'vh'])('level %s', (level) => {
    const ratio = contrast(token(`level-${level}-on`), token(`level-${level}`));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
