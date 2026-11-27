import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { colourOf, contrast, readTokens, THEMES } from '../lib/contrast';

const css = (...p: string[]) => readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/** The declaration block of the first rule whose selector is exactly `selector`. */
function rule(src: string, selector: string): string {
  const esc = selector.replace(/[.]/g, '\\.');
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(src);
  if (!m) throw new Error(`rule ${selector} not found`);
  return m[1]!;
}

const charts = [
  { name: 'dashboard', file: ['features', 'dashboard', 'dashboard.module.css'], sel: '.grid' },
  {
    name: 'results',
    file: ['features', 'results', 'overview', 'results.module.css'],
    sel: '.factorGrid',
  },
  { name: 'compare', file: ['features', 'compare', 'compare.module.css'], sel: '.grid' },
];

describe('chart grid lines use --chart-grid', () => {
  it.each(charts)('$name grid rule draws only --chart-grid', ({ file, sel }) => {
    const body = rule(css(...file), sel);
    expect(body).toContain('var(--chart-grid)');
    expect(body).not.toMatch(/var\(--color-(divider|border)\)/);
  });

  it('the dashboard gliding grid still draws from --axis-steps', () => {
    const src = css('features', 'dashboard', 'dashboard.module.css');
    expect(rule(src, '.grid')).toContain('var(--axis-steps, 3)');
    expect(src).toMatch(/@property --axis-steps/);
  });

  it.each(THEMES)('reaches 2:1 on the card and the surface (%s theme)', (theme) => {
    const tokens = readTokens(theme);
    for (const bg of ['color-card', 'color-surface']) {
      expect(
        contrast(colourOf(tokens, 'chart-grid'), colourOf(tokens, bg)),
        bg,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});
