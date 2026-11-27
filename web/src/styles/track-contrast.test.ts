import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { colourOf, contrast, readTokens, THEMES, type TokenMap } from '@/lib/contrast';

const read = (...p: string[]) => readFileSync(path.join(__dirname, '..', ...p), 'utf8');
// Both themes: the light :root values and the dark values on top.
const themes = THEMES.map((t) => [t, readTokens(t)] as const);
const ratio = (fg: string, bg: string, map: TokenMap) =>
  contrast(colourOf(map, fg), colourOf(map, bg));

const cards = ['color-card', 'color-surface'];

describe('slider and progress tracks (WCAG 1.4.11, 3:1 against the card)', () => {
  it('the form slider and progress tracks draw an edge in a token that reaches 3:1', () => {
    const src = read('features', 'projects', 'ProjectForm.tsx');
    const tracks = [...src.matchAll(/className="[^"]*bg-blue-100[^"]*"/g)].map((m) => m[0]);
    expect(tracks.length).toBeGreaterThanOrEqual(2);
    for (const cls of tracks) {
      const edge = /\bborder-([a-z0-9-]+)\b/.exec(cls)?.[1];
      expect(edge, cls).toBeDefined();
      for (const [theme, map] of themes) {
        for (const bg of cards) {
          expect(
            ratio(`color-${edge}`, bg, map),
            `${edge} on ${bg} (${theme})`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('the stepper segment not yet done reaches 3:1', () => {
    const css = read('components', 'ui', 'display.module.css');
    const rule = /\.progressSeg\s*\{[^}]*background:\s*var\(--([a-z0-9-]+)\)/.exec(css);
    expect(rule).not.toBeNull();
    for (const [theme, map] of themes) {
      for (const bg of cards) {
        expect(ratio(rule![1]!, bg, map), `${bg} (${theme})`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
