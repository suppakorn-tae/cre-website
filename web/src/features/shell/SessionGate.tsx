import type { ReactNode } from 'react';

import { AppShell, type ShellVariant } from './AppShell';
import { requireSession } from './guard';

/** Checks the session on the server, then wraps the page in the shell. */
export async function SessionGate({
  variant,
  children,
}: {
  variant: ShellVariant;
  children: ReactNode;
}) {
  const session = await requireSession({ requireAdmin: variant === 'admin' });
  return (
    <AppShell
      variant={variant}
      user={{ email: session.user.email, isAdmin: session.user.role === 'admin' }}
    >
      {children}
    </AppShell>
  );
}
