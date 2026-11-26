import { describe, expect, it } from 'vitest';

type PageModule = { default: (props: never) => unknown };
type Prop = 'params' | 'searchParams';

// Every page that reads `params` or `searchParams`. Reading either outside
// `<Suspense>` ties the prerendered shell to one URL (Next's
// `instant-shell-url-data`), so the page itself must return without touching
// the promise.
const PAGES: [name: string, prop: Prop, load: () => Promise<PageModule>][] = [
  ['project', 'params', () => import('./(app)/projects/[projectId]/page')],
  ['project edit', 'params', () => import('./(app)/projects/[projectId]/edit/page')],
  ['compare', 'params', () => import('./(app)/projects/[projectId]/compare/page')],
  [
    'assess',
    'params',
    () => import('./(app)/projects/[projectId]/versions/[versionId]/assess/page'),
  ],
  [
    'results',
    'params',
    () => import('./(app)/projects/[projectId]/versions/[versionId]/results/page'),
  ],
  ['admin user', 'params', () => import('./(admin)/admin/users/[userId]/page')],
  ['admin advice', 'searchParams', () => import('./(admin)/admin/advice/page')],
];

describe('dynamic route pages', () => {
  it.each(PAGES)('%s does not read its URL data outside Suspense', async (_name, prop, load) => {
    const { default: Page } = await load();
    let touched = false;
    const data = new Proxy(Promise.resolve({}), {
      get(target, key, receiver) {
        if (key === 'then') touched = true;
        return Reflect.get(target, key, receiver);
      },
    });

    const element = (Page as (props: Record<Prop, Promise<unknown>>) => unknown)({
      [prop]: data,
    } as Record<Prop, Promise<unknown>>);

    expect(element).not.toBeInstanceOf(Promise);
    expect(touched).toBe(false);
    // The outermost element is the Suspense boundary that holds the read.
    expect((element as { type: unknown }).type).toBe(Symbol.for('react.suspense'));
  });
});
