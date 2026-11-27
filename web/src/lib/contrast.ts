/**
 * WCAG 2.x contrast maths and a reader for the colour tokens in styles/tokens.css.
 * Shared by the token tests, so there is one implementation of the formula.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type TokenMap = Readonly<Record<string, string>>;

const TOKENS_CSS = path.resolve(__dirname, '../styles/tokens.css');

/** Every `--name: value;` of the first `:root` block, without the leading dashes. */
export function readTokens(css: string = readFileSync(TOKENS_CSS, 'utf8')): TokenMap {
  const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  const out: Record<string, string> = {};
  for (const m of root.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

/** Hex value of a token, following `var(--x)` references. Throws when it is not a hex colour. */
export function colourOf(tokens: TokenMap, name: string): string {
  const v = tokens[name];
  if (v === undefined) throw new Error(`token --${name} not found`);
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  if (ref) return colourOf(tokens, ref[1]!);
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`token --${name} is not a 6-digit hex colour`);
  return v.toLowerCase();
}

export function luminance(hex: string): number {
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
