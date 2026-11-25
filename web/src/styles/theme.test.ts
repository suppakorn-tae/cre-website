import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The Tailwind theme (app/globals.css) must only point at styles/tokens.css.
const tokens = readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');
const globals = readFileSync(path.join(__dirname, '../app/globals.css'), 'utf8');

const tokenNames = [...tokens.matchAll(/^\s*--([\w-]+):/gm)].map((m) => m[1]!);
const theme = /@theme inline (?:reference )?\{([\s\S]*?)\n\}/.exec(globals)?.[1] ?? '';

// Tokens with no utility on purpose: cards are flat, so `shadow-card` is `none`.
// `--focus-ring` has its own `focus-ring` utility, `--margin-page` and the
// other layout tokens are exposed as spacing names (see the theme block).
const NO_UTILITY = new Set(['shadow-card', 'focus-ring']);
// --space-N is the Nth multiple of the 4px base: `p-N` needs no name of its own.
const SPACE_STEP = /^space-(\d+)$/;

describe('tailwind theme', () => {
  it('has an @theme inline block', () => {
    expect(theme).not.toBe('');
  });

  it.each(tokenNames.filter((n) => !NO_UTILITY.has(n) && !SPACE_STEP.test(n)))(
    'maps --%s from tokens.css',
    (name) => {
      expect(theme).toContain(`var(--${name})`);
    },
  );

  it('uses --space-1 as the spacing step, so p-N is --space-N', () => {
    expect(theme).toContain('--spacing: var(--space-1);');
    for (const name of tokenNames.filter((n) => SPACE_STEP.test(n))) {
      const n = Number(SPACE_STEP.exec(name)![1]);
      expect(tokens).toMatch(new RegExp(`--${name}:\\s*${n * 4}px;`));
    }
  });

  it('only references variables that exist in tokens.css', () => {
    const used = [...theme.matchAll(/var\(--([\w-]+)\)/g)].map((m) => m[1]!);
    for (const name of used) expect(tokenNames).toContain(name);
  });

  it('has no colour literals (hex, rgb, hsl, oklch) in globals.css', () => {
    const withoutComments = globals.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl|oklch|lab)a?\(/);
  });

  it('does not load Preflight', () => {
    expect(globals).not.toMatch(/preflight|@import ['"]tailwindcss['"]/);
  });
});
