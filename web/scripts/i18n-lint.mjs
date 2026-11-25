// i18n lint (IO-81). Fails on:
//  1. hard-coded text in JSX (text nodes and user-facing string attributes)
//  2. spec codes (UC-, FR-, BR-, NFR-) or "snapshot" in message catalogues
//     and in the report template catalogue / PDF template.
// Tests, mocks and the dev-only route group are excluded (see ALLOW_FILE).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = join(webRoot, '..');

const ALLOW_FILE = [
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /(^|\/)mocks?\.tsx?$/,
  /(^|\/)[A-Za-z]*Mocks\.tsx?$/,
  /(^|\/)mocks\//,
  /^src\/app\/\(dev\)\//,
];
// Known violations in files owned by open feature PRs; fix there, then delete the entry.
const ALLOW_KNOWN = [
  // open PR #70, remove after fix
  'src/features/admin/advice/Notation.tsx',
];

const TEXT_ATTRS = new Set(['aria-label', 'aria-description', 'title', 'placeholder', 'alt']);
const CODE_RE = /\b(UC|FR|BR|NFR)-\d+|snapshot/i;
const LETTER_RE = /\p{L}/u;

const problems = [];
const report = (file, line, msg) => problems.push(`${file}:${line}: ${msg}`);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p, base) => relative(base, p).split(sep).join('/');

// 1. JSX text
for (const file of walk(join(webRoot, 'src')).filter((f) => f.endsWith('.tsx'))) {
  const r = rel(file, webRoot);
  if (ALLOW_FILE.some((re) => re.test(r)) || ALLOW_KNOWN.includes(r)) continue;
  const src = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const lineOf = (n) => src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
  const visit = (n) => {
    if (ts.isJsxText(n)) {
      const t = n.text.trim();
      if (t && LETTER_RE.test(t)) report(r, lineOf(n), `hard-coded JSX text "${t.slice(0, 40)}"`);
    } else if (
      ts.isJsxAttribute(n) &&
      TEXT_ATTRS.has(n.name.getText(src)) &&
      n.initializer &&
      ts.isStringLiteral(n.initializer) &&
      LETTER_RE.test(n.initializer.text)
    ) {
      report(
        r,
        lineOf(n),
        `hard-coded ${n.name.getText(src)}="${n.initializer.text.slice(0, 40)}"`,
      );
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}

// 2. Catalogues and PDF template
const catalogueFiles = [
  ...walk(join(webRoot, 'messages')).filter((f) => f.endsWith('.json')),
  ...walk(join(repoRoot, 'backend/templates/report')).filter((f) =>
    /\.(json|html|tmpl|gotmpl)$/.test(f),
  ),
];
for (const file of catalogueFiles) {
  const r = rel(file, repoRoot);
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const m = line.match(CODE_RE);
      if (m) report(r, i + 1, `forbidden term "${m[0]}" in user-facing copy`);
    });
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\ni18n-lint: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('i18n-lint: ok');
