import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The white alias is gone (IO-261). Dark mode needs the two roles it served: --color-card for
// a background and --color-on-solid for text on a fill. This fails the web CI job if
// --color-white or a white utility (bg-white, text-white, ...) comes back in web/src. Test
// files are skipped: they name the pattern in order to forbid it.
const SRC = path.resolve(__dirname, '..');
const FORBIDDEN =
  /--color-white\b|\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to)-white\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(css|tsx?|mdx?)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('no --color-white, bg-white or text-white in web/src', () => {
  const sources = files(SRC);

  it('scans the source tree', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('finds no forbidden use', () => {
    const hits = sources
      .filter((p) => FORBIDDEN.test(readFileSync(p, 'utf8')))
      .map((p) => path.relative(SRC, p));
    expect(hits).toEqual([]);
  });
});
