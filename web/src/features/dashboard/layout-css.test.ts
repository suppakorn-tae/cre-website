import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Layout is not measurable in jsdom, so the rule text is checked instead. */
describe('dashboard level names', () => {
  it('wrap instead of being cut with an ellipsis', () => {
    const css = readFileSync(join(__dirname, 'dashboard.module.css'), 'utf8');
    const block = /\.barName\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).not.toBe('');
    expect(block).not.toMatch(/text-overflow/);
    expect(block).not.toMatch(/white-space:\s*nowrap/);
  });
});

describe('dashboard project table', () => {
  it('turns into cards below 1024px so it cannot overflow the page', () => {
    const css = readFileSync(join(__dirname, 'dashboard.module.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 1023px\)\s*\{\s*\.table,/);
  });
});
