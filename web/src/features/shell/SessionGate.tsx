import { Suspense, type ReactNode } from 'react';

import { AccountControl, AdminSide, AppShell, type ShellVariant } from './AppShell';
import { sessionFor } from './guard';
import { AccountSkeleton, ContentSkeleton, SideSkeleton } from './Skeletons';

/**
 * Wraps the signed-in pages in the shell. The frame (header, logo, side menu)
 * is static and prerenders; only what needs the session waits for it, each
 * behind its own `<Suspense>` boundary with a skeleton. The admin side menu
 * counts as session-dependent: it is only sent once the guard has confirmed an
 * admin, so a visitor who gets a 404 or a redirect never receives it.
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
      side={
        variant === 'admin' ? (
          <Suspense fallback={<SideSkeleton />}>
            <SessionSide />
          </Suspense>
        ) : undefined
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

async function SessionSide() {
  await sessionFor('admin');
  return <AdminSide />;
}

/** Redirects to log-in or 404s before the page is shown; otherwise renders it. */
async function SessionGuard({ variant, children }: { variant: ShellVariant; children: ReactNode }) {
  await sessionFor(variant);
  return children;
}
