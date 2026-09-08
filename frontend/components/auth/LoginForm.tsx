'use client';

import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-client';
import { loginWithCredentials, type AuthUser } from '@/lib/auth';

interface LoginFormProps {
  onAuthenticated: (user: AuthUser) => void;
}

export function LoginForm({ onAuthenticated }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await loginWithCredentials(username.trim(), password);
      onAuthenticated(user);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.detail
          : 'Sign-in is unavailable right now. Check the server and try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={busy}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="pr-12"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            required
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={busy}
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-5" />
            ) : (
              <Eye aria-hidden="true" className="size-5" />
            )}
          </button>
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-fail/30 bg-fail/10 p-3 text-sm text-fail"
        >
          <p className="font-semibold">Unable to sign in</p>
          <p>{error}</p>
        </div>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
