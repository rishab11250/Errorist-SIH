import type { ReactNode } from 'react';

import { WorkspaceShell } from '@/components/WorkspaceShell';
import { AuthProvider } from '@/lib/auth';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </AuthProvider>
  );
}
