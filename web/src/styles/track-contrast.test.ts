import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (...p: string[]) => readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const tokens = read('styles', 'tokens.css');

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

const cards = ['color-white', 'color-surface'];

describe('slider and progress tracks (WCAG 1.4.11, 3:1 against the card)', () => {
  it('the form slider and progress tracks draw an edge in a token that reaches 3:1', () => {
    const src = read('features', 'projects', 'ProjectForm.tsx');
    const tracks = [...src.matchAll(/className="[^"]*bg-blue-100[^"]*"/g)].map((m) => m[0]);
    expect(tracks.length).toBeGreaterThanOrEqual(2);
    for (const cls of tracks) {
      const edge = /\bborder-([a-z0-9-]+)\b/.exec(cls)?.[1];
      expect(edge, cls).toBeDefined();
      for (const bg of cards) {
        expect(
          contrast(token(`color-${edge}`), token(bg)),
          `${edge} on ${bg}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('the stepper segment not yet done reaches 3:1', () => {
    const css = read('components', 'ui', 'display.module.css');
    const rule = /\.progressSeg\s*\{[^}]*background:\s*var\(--([a-z0-9-]+)\)/.exec(css);
    expect(rule).not.toBeNull();
    for (const bg of cards) {
      expect(contrast(token(rule![1]!), token(bg)), bg).toBeGreaterThanOrEqual(3);
    }
  });
});
