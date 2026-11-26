import { ToasterProvider } from '@/components/ui';
import { SessionGate } from '@/features/shell/SessionGate';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // The shell frame prerenders; the session check streams in behind boundaries
  // inside SessionGate. One toast stack serves every page of the app.
  return (
    <ToasterProvider>
      <SessionGate variant="app">{children}</SessionGate>
    </ToasterProvider>
  );
}
