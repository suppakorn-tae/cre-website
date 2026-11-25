import { cache, Suspense, type ReactNode } from 'react';

import { AccountControl, AppShell, type ShellVariant } from './AppShell';
import { requireSession } from './guard';
import { AccountSkeleton, ContentSkeleton } from './Skeletons';

// One session check per request, shared by the account control and the guard.
const sessionFor = cache((variant: ShellVariant) =>
  requireSession({ requireAdmin: variant === 'admin' }),
);

/**
 * Wraps the signed-in pages in the shell. The frame (header, logo, side menu)
 * is static and prerenders; only what needs the session waits for it, each
 * behind its own `<Suspense>` boundary with a skeleton.
 */
export function SessionGate({ variant, children }: { variant: ShellVariant; children: ReactNode }) {
  return (
    <AppShell
      variant={variant}
      account={
        <Suspense fallback={<AccountSkeleton />}>
          <SessionAccount variant={variant} />
        </Suspense>
      }
    >
      <Suspense fallback={<ContentSkeleton />}>
        <SessionGuard variant={variant}>{children}</SessionGuard>
      </Suspense>
    </AppShell>
  );
}

async function SessionAccount({ variant }: { variant: ShellVariant }) {
  const { user } = await sessionFor(variant);
  return <AccountControl user={{ email: user.email, isAdmin: user.role === 'admin' }} />;
}

/** Redirects to log-in or 404s before the page is shown; otherwise renders it. */
async function SessionGuard({ variant, children }: { variant: ShellVariant; children: ReactNode }) {
  await sessionFor(variant);
  return children;
}
