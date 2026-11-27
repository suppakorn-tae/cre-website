import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The shared kit is on the theme tokens: --color-card for backgrounds and
// --color-on-solid for text on a fill. The deprecated white alias would stay
// white-ish in neither role in dark mode.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(css|tsx?)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

const sources = files(__dirname).map((p) => [path.basename(p), readFileSync(p, 'utf8')] as const);

describe('components/ui theme tokens', () => {
  it.each(sources)('%s has no --color-white, bg-white or text-white', (_name, src) => {
    expect(src).not.toMatch(/--color-white\b|\b(bg|text|border|fill|stroke)-white\b/);
  });

  it.each(sources.filter(([n]) => n.endsWith('.css')))(
    '%s has no colour literal (hex, rgb, hsl)',
    (_name, src) => {
      const css = src.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl)a?\(/);
    },
  );
});
