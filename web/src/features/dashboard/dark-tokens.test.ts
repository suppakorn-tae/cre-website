import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The features moved to the theme tokens (IO-257): nothing may paint a fixed white or hex. */
const FEATURES = ['dashboard', 'projects', 'versions', 'reports'];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

describe.each(FEATURES)('features/%s colours', (feature) => {
  const root = join(__dirname, '..');
  const list = files(join(root, feature));

  it('has files to check', () => {
    expect(list.length).toBeGreaterThan(0);
  });

  it.each(list.map((f) => [f.slice(root.length + 1), f]))(
    '%s has no fixed white or hex colour',
    (_name, path) => {
      const text = readFileSync(path as string, 'utf8');
      expect(text).not.toMatch(/--color-white|\bbg-white\b|\btext-white\b|\bborder-white\b/);
      expect(text).not.toMatch(/(?:^|[\s:(,])#[0-9a-fA-F]{3,8}\b/m);
    },
  );
});
