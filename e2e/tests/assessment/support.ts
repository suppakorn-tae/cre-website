import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

type Catalogue = Record<string, unknown>;

const load = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../web/messages/th/${name}.json`, import.meta.url), 'utf8'),
  ) as Catalogue;

const catalogues: Record<string, Catalogue> = {};

/** The Thai message `ns.path` read from web/messages/th/<ns>.json. */
export function msg(ns: string, path: string, values: Record<string, string | number> = {}) {
  const source = (catalogues[ns] ??= load(ns));
  const value = path.split('.').reduce<unknown>((o, k) => (o as Catalogue | undefined)?.[k], source);
  if (typeof value !== 'string') throw new Error(`missing message ${ns}.${path}`);
  return value.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Golden inputs from backend/internal/engine/testdata/golden.json (percent units). */
export type Golden = {
  code: string;
  x: number;
  y1: number;
  y2: number;
  y3: string[];
  rl: number;
  ri_c: number;
  ri_t: number;
  ri_e: number;
  rm: number;
  level: 'VL' | 'L' | 'M' | 'H' | 'VH';
};

export const GOLDEN_VH: Golden = {
  code: 'EC-MG-1', x: 8.41, y1: 70, y2: 66, y3: ['G', 'C'],
  rl: 4.7, ri_c: 4.46, ri_t: 4.28, ri_e: 4, rm: 4.578, level: 'VH',
};
export const GOLDEN_M: Golden = {
  code: 'EC-MG-2', x: 12.03, y1: 30, y2: 40, y3: ['F', 'B'],
  rl: 3.2, ri_c: 2.26, ri_t: 2.71, ri_e: 3, rm: 3.098, level: 'M',
};
export const GOLDEN_VL: Golden = {
  code: 'EC-MG-3', x: 1.57, y1: 3, y2: 5, y3: ['A'],
  rl: 1.3, ri_c: 1, ri_t: 1, ri_e: 1, rm: 1.14, level: 'VL',
};
// Version 2 re-answers EC-MG-1 with the golden "low" input.
export const GOLDEN_V2: Golden = {
  code: 'EC-MG-1', x: 1.66, y1: 85, y2: 20, y3: ['B'],
  rl: 1.3, ri_c: 5, ri_t: 1.65, ri_e: 1, rm: 2.55, level: 'M',
};

export const answerBody = (g: Golden) => ({
  indicator_code: g.code,
  x: g.x,
  y1: { value: g.y1, unit: 'percent' },
  y2: { value: g.y2, unit: 'percent' },
  y3: g.y3,
});

/** Extract the text of a PDF with poppler's pdftotext (preinstalled on CI runners). */
export function pdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'cre-e2e-pdf-'));
  const file = join(dir, 'report.pdf');
  writeFileSync(file, pdf);
  return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
}

import type { Api } from '../../helpers/api';

/** PUT/PATCH on /api/v1 with the CSRF token (helpers/api.ts only has post/get). */
export async function send(api: Api, method: 'put' | 'patch', path: string, data: unknown) {
  const csrf = ((await (await api.ctx.get('/api/v1/auth/csrf')).json()) as { csrf_token: string }).csrf_token;
  return api.ctx[method](`/api/v1${path}`, { data, headers: { 'X-CSRF-Token': csrf } });
}
