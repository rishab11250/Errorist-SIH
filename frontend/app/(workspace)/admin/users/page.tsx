'use client';

import { useEffect, useState } from 'react';

import { UserTable, type ManagedUser } from '@/components/auth/UserTable';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    let active = true;
    setError(null);
    apiFetch<ManagedUser[]>('/api/users')
      .then((value) => {
        if (active) setUsers(value);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Users could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [reload, currentUser?.role]);

  if (currentUser && currentUser.role !== 'admin') {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div role="alert" className="surface-panel space-y-3 border-fail/30 p-5 text-fail">
          <p className="font-semibold">Access denied</p>
          <p>Administrator access is required to manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Administration
        </p>
        <h1 className="text-h1">User management</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Create local accounts, assign roles, revoke access, and reset credentials.
        </p>
      </header>
      {!users && !error ? <p role="status">Loading users…</p> : null}
      {error ? (
        <div role="alert" className="surface-panel space-y-3 border-fail/30 p-5 text-fail">
          <p className="font-semibold">Unable to load users</p>
          <p>{error}</p>
          <Button variant="outline" onClick={() => setReload((value) => value + 1)}>
            Try again
          </Button>
        </div>
      ) : null}
      {users ? <UserTable initialUsers={users} /> : null}
    </div>
  );
}
