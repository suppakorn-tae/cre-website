import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Dark mode (IO-258): the assessment and plan features use theme tokens only. A white
// utility, the deprecated --color-white alias or a hard-coded colour would stay light.
const FEATURES = ['assessment', 'plan'];
const root = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('theme tokens in the assessment and plan features', () => {
  for (const feature of FEATURES) {
    for (const file of files(join(root, feature))) {
      it(`${feature}/${file.split('/').pop()} has no white or hard-coded colour`, () => {
        const src = readFileSync(file, 'utf8');
        expect(src).not.toMatch(/\b(?:bg|text|border|fill|stroke)-white\b/);
        expect(src).not.toMatch(/--color-white/);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(src).not.toMatch(/rgba?\(/);
      });
    }
  }
});
