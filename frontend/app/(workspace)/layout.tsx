import type { ReactNode } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WorkspaceShell } from '@/components/WorkspaceShell';
import { AuthProvider } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WorkspaceShell>
        <ErrorBoundary>{children}</ErrorBoundary>
      </WorkspaceShell>
    </AuthProvider>
  );
}
