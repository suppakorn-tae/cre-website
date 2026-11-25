import { SessionGate } from '@/features/shell/SessionGate';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // The shell frame prerenders; the session check streams in behind boundaries
  // inside SessionGate.
  return <SessionGate variant="app">{children}</SessionGate>;
}
