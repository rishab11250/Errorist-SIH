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
        <Button className="inline-flex items-center justify-center gap-2 px-4 py-2 h-auto rounded-kinetic bg-kinetic-terracotta hover:bg-kinetic-terracottaHover text-white text-xs font-mono font-semibold tracking-wide transition shadow-sm">
          <UserPlus aria-hidden="true" className="w-4 h-4" />
          <span>Create user</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white rounded-kinetic border border-[#EBE5DB] p-6 shadow-xl max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-lg text-kinetic-charcoal">
            Create Local User
          </DialogTitle>
          <DialogDescription className="text-xs text-kinetic-textMuted">
            Create an inspector or administrator account for this installation.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="new-username" className="text-xs font-mono text-kinetic-textMuted uppercase tracking-wider">
              Username
            </Label>
            <Input
              id="new-username"
              name="username"
              required
              autoComplete="off"
              className="h-10 bg-[#FAF8F3] border-[#EBE5DB] rounded-kinetic text-xs sm:text-sm font-mono text-kinetic-charcoal focus:border-kinetic-terracotta"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-display-name" className="text-xs font-mono text-kinetic-textMuted uppercase tracking-wider">
              Display name
            </Label>
            <Input
              id="new-display-name"
              name="display_name"
              required
              className="h-10 bg-[#FAF8F3] border-[#EBE5DB] rounded-kinetic text-xs sm:text-sm font-sans text-kinetic-charcoal focus:border-kinetic-terracotta"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-xs font-mono text-kinetic-textMuted uppercase tracking-wider">
              Temporary password
            </Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="h-10 bg-[#FAF8F3] border-[#EBE5DB] rounded-kinetic text-xs sm:text-sm font-mono text-kinetic-charcoal focus:border-kinetic-terracotta"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-role" className="text-xs font-mono text-kinetic-textMuted uppercase tracking-wider">
              Role
            </Label>
            <select
              id="new-role"
              name="role"
              defaultValue="inspector"
              className="h-10 w-full rounded-kinetic border border-[#EBE5DB] bg-[#FAF8F3] px-3 text-xs sm:text-sm font-sans text-kinetic-charcoal focus:border-kinetic-terracotta focus:outline-none cursor-pointer"
            >
              <option value="inspector">Inspector</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          {error ? (
            <p role="alert" className="rounded-kinetic-sm bg-kinetic-failLight border border-kinetic-fail/30 p-3 text-xs text-kinetic-fail font-mono">
              {error}
            </p>
          ) : null}
          <DialogFooter className="pt-2">
            <Button
              type="submit"
              disabled={busy}
              className="px-4 py-2 h-auto rounded-kinetic-sm bg-kinetic-terracotta hover:bg-kinetic-terracottaHover text-white font-mono text-xs font-semibold shadow-sm transition"
            >
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
  triggerAriaLabel,
}: {
  user: ManagedUser;
  onUpdated: (user: ManagedUser) => void;
  triggerAriaLabel?: string;
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
        <Button
          variant="outline"
          size="sm"
          aria-label={triggerAriaLabel ?? `Manage ${user.display_name}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 h-auto rounded-kinetic-sm bg-white border border-[#EBE5DB] hover:border-kinetic-terracotta hover:text-kinetic-terracotta font-mono text-xs font-medium text-kinetic-charcoal shadow-sm transition"
        >
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white rounded-kinetic border border-[#EBE5DB] p-6 shadow-xl max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-lg text-kinetic-charcoal">
            Manage {user.display_name}
          </DialogTitle>
          <DialogDescription className="text-xs text-kinetic-textMuted">
            Change access carefully. Deactivation revokes active sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`role-${user.id}`} className="text-xs font-mono text-kinetic-textMuted uppercase tracking-wider">
                Role
              </Label>
              <select
                id={`role-${user.id}`}
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as ManagedUser['role']);
                  setConfirmed(false);
                }}
                className="h-10 w-full rounded-kinetic border border-[#EBE5DB] bg-[#FAF8F3] px-3 text-xs sm:text-sm font-sans text-kinetic-charcoal focus:border-kinetic-terracotta focus:outline-none cursor-pointer"
                disabled={busy}
              >
                <option value="inspector">Inspector</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <label className="flex min-h-10 items-center gap-3 self-end rounded-kinetic border border-[#EBE5DB] bg-[#FAF8F3] px-3 py-2 text-xs font-mono text-kinetic-charcoal cursor-pointer select-none">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => {
                  setActive(event.target.checked);
                  setConfirmed(false);
                }}
                disabled={busy}
                className="rounded accent-kinetic-terracotta"
              />{' '}
              Active account
            </label>
          </div>
          {accessChanged ? (
            <label className="flex items-start gap-3 rounded-kinetic-sm bg-kinetic-warnLight border border-kinetic-warn/30 p-3 text-xs text-kinetic-charcoal">
              <input
                type="checkbox"
                className="mt-0.5 rounded accent-kinetic-terracotta"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>I understand this role or account-status change affects access immediately.</span>
            </label>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={saveAccess}
            disabled={busy || !accessChanged || !confirmed}
            className="px-3.5 py-2 h-auto rounded-kinetic-sm bg-[#FAF8F3] border border-[#EBE5DB] hover:border-kinetic-charcoal text-xs font-mono text-kinetic-charcoal transition disabled:opacity-40"
          >
            Save access change
          </Button>

          <div className="space-y-3 border-t border-[#F2EDE4] pt-4">
            <div>
              <h3 className="font-display font-semibold text-sm text-kinetic-charcoal">Reset password</h3>
              <p className="text-xs text-kinetic-textMuted mt-0.5">
                The new value is cleared from this form after every attempt.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`password-${user.id}`} className="text-xs font-mono text-kinetic-textMuted uppercase tracking-wider">
                New password
              </Label>
              <Input
                id={`password-${user.id}`}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                className="h-10 bg-[#FAF8F3] border-[#EBE5DB] rounded-kinetic text-xs sm:text-sm font-mono text-kinetic-charcoal focus:border-kinetic-terracotta"
              />
            </div>
            <Button
              type="button"
              onClick={resetPassword}
              disabled={busy || !password}
              className="inline-flex items-center gap-1.5 px-4 py-2 h-auto rounded-kinetic-sm bg-kinetic-charcoal hover:bg-kinetic-charcoalLight text-white font-mono text-xs font-semibold shadow-sm transition disabled:opacity-40"
            >
              <KeyRound aria-hidden="true" className="w-3.5 h-3.5" />
              <span>Reset password</span>
            </Button>
          </div>
          {error ? (
            <p role="alert" className="rounded-kinetic-sm bg-kinetic-failLight border border-kinetic-fail/30 p-3 text-xs text-kinetic-fail font-mono">
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
          <h2 id="users-heading" className="text-lg font-bold font-display text-kinetic-charcoal">
            Local Users
          </h2>
          <p className="text-xs font-mono text-kinetic-textMuted mt-0.5">
            {users.length} configured account{users.length === 1 ? '' : 's'}.
          </p>
        </div>
        <CreateUserDialog onCreated={upsert} />
      </div>

      {/* Mobile Cards View */}
      <div className="space-y-3 md:hidden">
        {users.map((user) => (
          <div
            key={user.id}
            className="rounded-kinetic border border-[#EBE5DB] bg-white p-4 shadow-sm space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="block font-semibold text-kinetic-charcoal text-sm font-sans">{user.display_name}</span>
                <span className="font-mono text-xs text-kinetic-textMuted">{user.username}</span>
              </div>
              <div>
                {user.role === 'admin' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-kinetic-charcoal text-white font-mono text-[10px] font-semibold tracking-wider uppercase">
                    Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#FAF8F3] border border-[#EBE5DB] text-kinetic-charcoal font-mono text-[10px] font-medium tracking-wider uppercase">
                    Inspector
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#F2EDE4] pt-2.5 text-xs font-mono">
              <div className="flex items-center gap-2">
                {user.is_active ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-kinetic-forestLight text-kinetic-forest border border-kinetic-forest/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-kinetic-forest" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-kinetic-failLight text-kinetic-fail border border-kinetic-fail/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-kinetic-fail" />
                    Inactive
                  </span>
                )}
              </div>
              <span className="text-kinetic-textMuted text-[11px]">
                {user.last_login_at ? `Login: ${new Date(user.last_login_at).toLocaleDateString()}` : 'Never logged in'}
              </span>
            </div>

            <div className="pt-1">
              <ManageUserDialog
                user={user}
                onUpdated={upsert}
                triggerAriaLabel={`Manage ${user.display_name} (mobile)`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-kinetic border border-[#EBE5DB] bg-white shadow-sm">
        <table className="w-full min-w-[44rem] border-collapse text-xs font-sans text-left">
          <caption className="sr-only">Local application users</caption>
          <thead className="bg-[#FAF8F3] border-b border-[#EBE5DB] text-[11px] font-mono uppercase tracking-wider text-kinetic-textMuted">
            <tr>
              <th className="py-3 px-4 font-semibold">User</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Last login</th>
              <th className="py-3 px-4 text-right font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2EDE4]">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-kinetic-terracottaLight/20 transition-colors">
                <th scope="row" className="py-3.5 px-4 text-left">
                  <span className="block font-semibold text-kinetic-charcoal font-sans">{user.display_name}</span>
                  <span className="font-mono text-xs text-kinetic-textMuted">{user.username}</span>
                </th>
                <td className="py-3.5 px-4">
                  {user.role === 'admin' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-kinetic-charcoal text-white font-mono text-[10px] font-semibold tracking-wider uppercase">
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#FAF8F3] border border-[#EBE5DB] text-kinetic-charcoal font-mono text-[10px] font-medium tracking-wider uppercase">
                      Inspector
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-4">
                  {user.is_active ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-kinetic-forestLight text-kinetic-forest border border-kinetic-forest/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-kinetic-forest" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-kinetic-failLight text-kinetic-fail border border-kinetic-fail/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-kinetic-fail" />
                      Inactive
                    </span>
                  )}
                </td>
                <td className="py-3.5 px-4 font-mono text-kinetic-textMuted">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                </td>
                <td className="py-3.5 px-4 text-right">
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
