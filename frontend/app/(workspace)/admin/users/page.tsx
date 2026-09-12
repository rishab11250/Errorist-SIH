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
        <div role="alert" className="rounded-kinetic border border-kinetic-fail/30 bg-kinetic-failLight p-5 text-kinetic-fail space-y-2 font-mono text-xs">
          <p className="font-semibold text-sm font-display text-kinetic-fail">Access denied</p>
          <p>Administrator access is required to manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#EBE5DB]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider text-kinetic-terracotta font-semibold">
              Administration
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-kinetic-terracotta"></span>
            <span className="text-xs font-mono text-kinetic-textMuted">Local Security Gateway</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-kinetic-charcoal">
            User Management
          </h1>
          <p className="text-sm text-kinetic-textMuted mt-1 max-w-2xl">
            Create local accounts, assign roles, revoke access, and reset credentials.
          </p>
        </div>
      </div>

      {!users && !error ? (
        <p role="status" className="text-xs font-mono text-kinetic-textMuted flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-kinetic-terracotta animate-pulse" />
          Loading users…
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-kinetic border border-kinetic-fail/30 bg-kinetic-failLight p-5 text-kinetic-fail space-y-3 font-mono text-xs">
          <p className="font-semibold text-sm font-display text-kinetic-fail">Unable to load users</p>
          <p>{error}</p>
          <Button
            variant="outline"
            onClick={() => setReload((value) => value + 1)}
            className="px-3 py-1.5 h-auto rounded-kinetic-sm bg-white border border-kinetic-fail/30 text-kinetic-fail font-mono text-xs hover:bg-kinetic-failLight"
          >
            Try again
          </Button>
        </div>
      ) : null}

      {users ? <UserTable initialUsers={users} /> : null}
    </div>
  );
}
