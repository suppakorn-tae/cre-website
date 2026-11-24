export type Messages = { [key: string]: string | Messages };

/**
 * Merges per-feature catalogues into one. Each catalogue is stored under a
 * namespace named after its file (`common.json` -> `common`), so features
 * cannot collide.
 */
export function mergeCatalogues(files: Record<string, Messages>): Messages {
  const merged: Messages = {};
  for (const name of Object.keys(files).sort()) {
    merged[name] = files[name];
  }
  return merged;
}
