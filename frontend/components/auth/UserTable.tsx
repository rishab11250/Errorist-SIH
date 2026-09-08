'use client';

import { KeyRound, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api-client';

export interface ManagedUser {
  id: number;
  username: string;
  display_name: string;
  role: 'inspector' | 'admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

function messageFor(reason: unknown) {
  return reason instanceof ApiError
    ? reason.detail
    : 'The user change could not be saved. Check your connection and try again.';
}

function CreateUserDialog({ onCreated }: { onCreated: (user: ManagedUser) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<ManagedUser>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: data.get('username'),
          display_name: data.get('display_name'),
          password: data.get('password'),
          role: data.get('role'),
        }),
      });
      form.reset();
      onCreated(created);
      setOpen(false);
    } catch (reason) {
      setError(messageFor(reason));
      const password = form.elements.namedItem('password');
      if (password instanceof HTMLInputElement) password.value = '';
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" /> Create user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create local user</DialogTitle>
          <DialogDescription>
            Create an inspector or administrator account for this installation.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="new-username">Username</Label>
            <Input id="new-username" name="username" required autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-display-name">Display name</Label>
            <Input id="new-display-name" name="display_name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Temporary password</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-role">Role</Label>
            <select
              id="new-role"
              name="role"
              defaultValue="inspector"
              className="h-11 w-full rounded-md border bg-background px-3"
            >
              <option value="inspector">Inspector</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          {error ? (
            <p role="alert" className="rounded-md bg-fail/10 p-3 text-sm text-fail">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManageUserDialog({
  user,
  onUpdated,
}: {
  user: ManagedUser;
  onUpdated: (user: ManagedUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.is_active);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accessChanged = role !== user.role || active !== user.is_active;

  async function patch(body: Record<string, unknown>) {
    return apiFetch<ManagedUser>(`/api/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async function saveAccess() {
    if (!accessChanged || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patch({ role, is_active: active });
      onUpdated(updated);
      setConfirmed(false);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patch({ password });
      onUpdated(updated);
    } catch (reason) {
      setError(messageFor(reason));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Manage ${user.display_name}`}>
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage {user.display_name}</DialogTitle>
          <DialogDescription>
            Change access carefully. Deactivation revokes active sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`role-${user.id}`}>Role</Label>
              <select
                id={`role-${user.id}`}
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as ManagedUser['role']);
                  setConfirmed(false);
                }}
                className="h-11 w-full rounded-md border bg-background px-3"
                disabled={busy}
              >
                <option value="inspector">Inspector</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <label className="flex min-h-11 items-center gap-3 self-end rounded-md border px-3">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => {
                  setActive(event.target.checked);
                  setConfirmed(false);
                }}
                disabled={busy}
              />{' '}
              Active account
            </label>
          </div>
          {accessChanged ? (
            <label className="flex items-start gap-3 rounded-md bg-warn/10 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I understand this role or account-status change affects access immediately.
            </label>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={saveAccess}
            disabled={busy || !accessChanged || !confirmed}
          >
            Save access change
          </Button>
          <div className="space-y-3 border-t pt-5">
            <div>
              <h3 className="font-heading font-semibold">Reset password</h3>
              <p className="text-sm text-muted-foreground">
                The new value is cleared from this form after every attempt.
              </p>
            </div>
            <Label htmlFor={`password-${user.id}`}>New password</Label>
            <Input
              id={`password-${user.id}`}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
            <Button type="button" onClick={resetPassword} disabled={busy || !password}>
              <KeyRound aria-hidden="true" /> Reset password
            </Button>
          </div>
          {error ? (
            <p role="alert" className="rounded-md bg-fail/10 p-3 text-sm text-fail">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UserTable({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  function upsert(updated: ManagedUser) {
    setUsers((current) =>
      [...current.filter((user) => user.id !== updated.id), updated].sort((a, b) =>
        a.username.localeCompare(b.username)
      )
    );
  }
  return (
    <section className="space-y-4" aria-labelledby="users-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="users-heading" className="text-h2">
            Local users
          </h2>
          <p className="text-sm text-muted-foreground">
            {users.length} configured account{users.length === 1 ? '' : 's'}.
          </p>
        </div>
        <CreateUserDialog onCreated={upsert} />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-surface">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">Local application users</caption>
          <thead className="bg-muted/70 text-left">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last login</th>
              <th className="p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t">
                <th scope="row" className="p-3 text-left">
                  <span className="block font-semibold">{user.display_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{user.username}</span>
                </th>
                <td className="p-3 capitalize">{user.role}</td>
                <td className="p-3">
                  <span
                    className={
                      user.is_active ? 'font-semibold text-pass' : 'font-semibold text-fail'
                    }
                  >
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-3">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                </td>
                <td className="p-3">
                  <ManageUserDialog user={user} onUpdated={upsert} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
