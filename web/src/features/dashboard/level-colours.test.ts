import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'dashboard.module.css'), 'utf8');

/** Last declared background of every rule that targets `.fill` for a level. */
function fillBackground(level: string): string | undefined {
  const rule = new RegExp(`\\.fill\\[data-level='${level}'\\]\\s*\\{([^}]*)\\}`, 'g');
  let last: string | undefined;
  for (const match of css.matchAll(rule)) {
    last = /background:\s*([^;]+);/.exec(match[1])?.[1].trim() ?? last;
  }
  return last;
}

describe('dashboard level bars', () => {
  it.each(['H', 'VH'])('colours %s with its level token', (level) => {
    expect(fillBackground(level)).toBe(`var(--level-${level.toLowerCase()})`);
  });

  it('has no level bar override in the track', () => {
    expect(css).not.toMatch(/\.track\s*>\s*\.fill\[data-level/);
  });
});
