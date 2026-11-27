import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (...path: string[]) => readFileSync(join(__dirname, ...path), 'utf8');

/** Layout is not measurable in jsdom, so the rule text is checked instead. */
describe('dashboard level names', () => {
  it('wrap instead of being cut with an ellipsis', () => {
    const css = read('dashboard.module.css');
    const block = /\.barName\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).not.toBe('');
    expect(block).not.toMatch(/text-overflow/);
    expect(block).not.toMatch(/white-space:\s*nowrap/);
  });
});

describe('dashboard search field', () => {
  it('keeps a transparent outline on focus so forced colours still draws it', () => {
    const css = read('dashboard.module.css');
    const block = /\.search:focus-within\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(block).toMatch(/outline:\s*2px solid transparent/);
    expect(block).toMatch(/box-shadow:\s*var\(--focus-ring\)/);
  });
});

describe('dashboard project table', () => {
  const ui = read('..', '..', 'components', 'ui', 'display.module.css');

  it('swaps the table for cards below 768px so it cannot overflow the page', () => {
    expect(ui).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.hasCards\s*\{\s*display: none;/);
    expect(ui).toMatch(/\.hasCards \+ \.cards\s*\{\s*display: block;/);
  });

  it('shows two columns of KPI cards from phone to tablet width', () => {
    const css = read('dashboard.module.css');
    expect(css).toMatch(
      /@media \(max-width: 1023px\)\s*\{\s*\.kpis\s*\{\s*grid-template-columns: repeat\(2,/,
    );
    // No later rule drops the KPI grid to one column on phones.
    expect(css).not.toMatch(/\.kpis\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  });

  it('gives the card actions a 44px tap target', () => {
    expect(read('dashboard.module.css')).toMatch(/\.cardActions > a\s*\{[^}]*min-height: 44px/);
  });
});
