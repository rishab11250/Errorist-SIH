'use client';

import { AlertCircle, ArrowRight, Eye, EyeOff, LoaderCircle, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';

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
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor="username"
          className="block text-xs font-bold uppercase tracking-wider text-charcoal/80 mb-1.5 font-heading"
        >
          Username
        </label>
        <div className="relative">
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={busy}
            placeholder="e.g. INSP-KA-0941"
            className="w-full bg-[#faf7f2] border border-[#dcd3c5] focus:border-amberAccent focus:bg-white text-charcoal text-sm rounded-[8px] px-3.5 py-2.5 outline-none transition-all font-medium placeholder:text-charcoal/30 pr-10"
            required
          />
          <div className="absolute right-3 top-3 pointer-events-none text-charcoal/40">
            <User className="size-4" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-bold uppercase tracking-wider text-charcoal/80 mb-1.5 font-heading"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
            placeholder="Enter secure password"
            className="w-full bg-[#faf7f2] border border-[#dcd3c5] focus:border-amberAccent focus:bg-white text-charcoal text-sm rounded-[8px] px-3.5 py-2.5 outline-none transition-all font-medium pr-10 placeholder:text-charcoal/30"
            required
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2.5 top-2.5 p-1 text-charcoal/50 hover:text-charcoal transition-colors rounded focus:outline-none"
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={busy}
            title={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="p-3 rounded-[8px] bg-[#fdf2f2] border border-[#f5c2c0] flex items-start gap-2.5 text-xs text-brickFail font-medium"
        >
          <AlertCircle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <span className="font-bold uppercase tracking-wider block font-heading">
              Authentication Failed
            </span>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      ) : null}

      <div className="pt-2">
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-amberAccent hover:bg-[#a94608] active:scale-[0.99] disabled:opacity-60 text-white font-heading font-semibold text-sm py-2.5 px-4 rounded-[8px] shadow-[0_4px_14px_rgba(193,85,12,0.3)] transition-all flex items-center justify-center gap-2"
        >
          {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
          <span>{busy ? 'Signing in…' : 'Sign in'}</span>
          {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </form>
  );
}
