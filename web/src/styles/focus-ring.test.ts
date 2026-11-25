import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const stylesDir = __dirname;
const srcDir = path.resolve(stylesDir, '..');
const tokens = readFileSync(path.join(stylesDir, 'tokens.css'), 'utf8');

function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens);
  if (!m) throw new Error(`token --${name} not found`);
  return m[1]!.trim();
}

function resolveColor(value: string): string {
  const ref = /^var\(--([\w-]+)\)$/.exec(value);
  return ref ? resolveColor(token(ref[1]!)) : value;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const ring = /--focus-ring:\s*0 0 0 (\d+)px (var\(--[\w-]+\)|#[0-9a-f]{6})\s*;/i.exec(tokens);

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

describe('focus ring token', () => {
  it('is a solid ring at least 2px thick', () => {
    expect(ring).not.toBeNull();
    expect(Number(ring![1])).toBeGreaterThanOrEqual(2);
  });

  it.each(['color-white', 'color-canvas', 'color-surface', 'color-subtle'])(
    'has at least 3:1 contrast against %s',
    (bg) => {
      const color = resolveColor(ring![2]);
      expect(contrast(color, resolveColor(token(bg)))).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('rules that use the focus ring', () => {
  it('never hide the outline completely (keeps forced-colors focus)', () => {
    const offenders: string[] = [];
    for (const file of cssFiles(srcDir)) {
      const css = readFileSync(file, 'utf8');
      for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
        const body = block[1]!;
        if (body.includes('var(--focus-ring)') && /outline:\s*none/.test(body)) {
          offenders.push(path.relative(srcDir, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
