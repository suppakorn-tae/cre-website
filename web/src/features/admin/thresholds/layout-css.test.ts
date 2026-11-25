import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Layout is not measurable in jsdom, so the rule text is checked instead. */
describe('RL table narrow columns', () => {
  const css = readFileSync(join(__dirname, 'thresholds.module.css'), 'utf8');
  const rule = (name: string) => new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('keep the action buttons on one line', () => {
    expect(rule('actions')).toMatch(/white-space:\s*nowrap/);
  });

  it('keep the direction label on one line', () => {
    expect(rule('direction')).toMatch(/white-space:\s*nowrap/);
  });
});
