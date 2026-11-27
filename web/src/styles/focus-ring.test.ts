import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { colourOf, contrast, readTokens, THEMES } from '@/lib/contrast';

const stylesDir = __dirname;
const srcDir = path.resolve(stylesDir, '..');
const tokens = readFileSync(path.join(stylesDir, 'tokens.css'), 'utf8');

// The ring is a card-coloured gap followed by the coloured band, so a blue control
// still shows it. The gap follows the theme (white in light, the dark card in dark).
const ring =
  /--focus-ring:\s*0 0 0 \d+px var\(--color-card\),\s*0 0 0 (\d+)px var\(--([\w-]+)\)\s*;/i.exec(
    tokens,
  );

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

describe('focus ring token', () => {
  it('is a card-gapped ring at least 2px thick', () => {
    expect(ring).not.toBeNull();
    expect(Number(ring![1])).toBeGreaterThanOrEqual(2);
  });

  describe.each(THEMES)('%s theme', (theme) => {
    const map = readTokens(theme);
    it.each(['color-card', 'color-canvas', 'color-surface', 'color-subtle'])(
      'has at least 3:1 contrast against %s',
      (bg) => {
        expect(contrast(colourOf(map, ring![2]!), colourOf(map, bg))).toBeGreaterThanOrEqual(3);
      },
    );
  });
});

describe('rules that use the focus ring', () => {
  it('never hide the outline completely (keeps forced-colors focus)', () => {
    const offenders: string[] = [];
    for (const file of cssFiles(srcDir)) {
      const css = readFileSync(file, 'utf8');
      for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
        const body = block[1]!;
        if (body.includes('var(--focus-ring)') && /outline:\s*none/.test(body)) {
          offenders.push(path.relative(srcDir, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
