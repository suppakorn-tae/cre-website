import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { mergeCatalogues, type Messages } from './merge';

/** Reads `messages/<locale>/*.json` and merges them. Runs at build time. */
export function loadCatalogue(messagesDir: string, locale: string): Messages {
  const dir = path.join(messagesDir, locale);
  const files: Record<string, Messages> = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    files[file.slice(0, -'.json'.length)] = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  }
  return mergeCatalogues(files);
}
