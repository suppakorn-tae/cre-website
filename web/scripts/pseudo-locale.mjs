// Pseudo-locale (IO-81): writes a copy of messages/th with every string about
// 30% longer, ICU placeholders and tags untouched, to check layouts for clipping.
// Usage: node scripts/pseudo-locale.mjs <outDir> [ratio]
// Never commit the output. To try it, copy it over messages/th and restore with git.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(fileURLToPath(new URL('..', import.meta.url)), 'messages', 'th');
const [outDir, ratioArg] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/pseudo-locale.mjs <outDir> [ratio]');
  process.exit(1);
}
const ratio = Number(ratioArg ?? 0.3);

/** Text outside ICU `{...}` arguments and `<tag>` markers, used as the padding source. */
function plainText(value) {
  let depth = 0;
  let out = '';
  for (const ch of value) {
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += ch;
  }
  return out.replace(/<[^>]*>/g, '');
}

/** Appends ~ratio extra characters after the whole message, so placeholders stay intact. */
function pad(value) {
  const text = plainText(value).trim();
  const extra = Math.ceil(text.length * ratio);
  if (!text || extra === 0) return value;
  return value + ' ' + text.repeat(Math.ceil(extra / text.length)).slice(0, extra);
}

const walk = (node) =>
  typeof node === 'string'
    ? pad(node)
    : Array.isArray(node)
      ? node.map(walk)
      : Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));

mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(src).filter((f) => f.endsWith('.json'))) {
  const json = JSON.parse(readFileSync(join(src, file), 'utf8'));
  writeFileSync(join(outDir, file), JSON.stringify(walk(json), null, 2) + '\n');
}
