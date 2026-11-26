import { describe, expect, it } from 'vitest';

type PageModule = { default: (props: never) => unknown };

// Every page with a dynamic segment. Reading `params` outside `<Suspense>`
// ties the prerendered shell to one URL (Next's `instant-shell-url-data`), so
// the page itself must return without touching the promise.
const PAGES: [string, () => Promise<PageModule>][] = [
  ['project', () => import('./(app)/projects/[projectId]/page')],
  ['project edit', () => import('./(app)/projects/[projectId]/edit/page')],
  ['compare', () => import('./(app)/projects/[projectId]/compare/page')],
  ['assess', () => import('./(app)/projects/[projectId]/versions/[versionId]/assess/page')],
  ['results', () => import('./(app)/projects/[projectId]/versions/[versionId]/results/page')],
  ['report', () => import('./(app)/projects/[projectId]/versions/[versionId]/report/page')],
  ['admin user', () => import('./(admin)/admin/users/[userId]/page')],
];

describe('dynamic route pages', () => {
  it.each(PAGES)('%s does not read params outside Suspense', async (_name, load) => {
    const { default: Page } = await load();
    let touched = false;
    const params = new Proxy(Promise.resolve({}), {
      get(target, key, receiver) {
        if (key === 'then') touched = true;
        return Reflect.get(target, key, receiver);
      },
    });

    const element = (Page as (props: { params: Promise<unknown> }) => unknown)({ params });

    expect(element).not.toBeInstanceOf(Promise);
    expect(touched).toBe(false);
    // The outermost element is the Suspense boundary that holds the read.
    expect((element as { type: unknown }).type).toBe(Symbol.for('react.suspense'));
  });
});
