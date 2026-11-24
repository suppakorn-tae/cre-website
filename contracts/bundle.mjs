// Builds contracts/openapi/dist/openapi.yaml from the root spec plus every
// paths/<domain>.yaml and schemas/<domain>.yaml, so a domain issue only adds
// its own files. Usage: node contracts/bundle.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "openapi");
const merged = join(root, ".merged.yaml");
const out = join(root, "dist", "openapi.yaml");

const files = (dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".yaml") && f !== "common.yaml")
    .sort();
const esc = (key) => key.replaceAll("~", "~0").replaceAll("/", "~1");

const doc = parse(readFileSync(join(root, "openapi.yaml"), "utf8"));
for (const f of files("paths")) {
  const body = parse(readFileSync(join(root, "paths", f), "utf8")) ?? {};
  for (const key of Object.keys(body)) {
    if (doc.paths[key]) throw new Error(`path ${key} defined twice (${f})`);
    doc.paths[key] = { $ref: `paths/${f}#/${esc(key)}` };
  }
}
for (const f of files("schemas")) {
  const body = parse(readFileSync(join(root, "schemas", f), "utf8")) ?? {};
  for (const key of Object.keys(body)) {
    if (doc.components.schemas[key]) throw new Error(`schema ${key} defined twice (${f})`);
    doc.components.schemas[key] = { $ref: `schemas/${f}#/${esc(key)}` };
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(merged, stringify(doc));
const redocly = join(root, "..", "..", "node_modules", "@redocly", "cli", "bin", "cli.js");
execFileSync(process.execPath, [redocly, "bundle", merged, "-o", out], { stdio: "inherit" });
