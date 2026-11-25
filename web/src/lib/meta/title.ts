/** Joins a page name and its context: `{page} · {context}`. The context is optional. */
export function pageTitle(page: string, context?: string | null): string {
  const extra = context?.trim();
  return extra ? `${page} · ${extra}` : page;
}

/** Context of a version page: `{nickname} v{n}`. */
export function versionContext(nickname: string, versionNo: number): string {
  return `${nickname} v${versionNo}`;
}
