'use client';

import { BarChart3, ClipboardCheck, History, LogOut, Menu, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import { SyncStatusIndicator } from '@/components/pwa/SyncStatusIndicator';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/cn';
import { useAuth, type AuthUser } from '@/lib/auth';

const navigation = [
  { href: '/', label: 'New inspection', icon: ClipboardCheck },
  { href: '/history', label: 'Repository', icon: History },
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
] as const;

function Navigation({ user, onNavigate }: { user: AuthUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items =
    user.role === 'admin'
      ? [...navigation, { href: '/admin/users', label: 'Users', icon: Users }]
      : navigation;
  return (
    <nav aria-label="Workspace navigation" className="space-y-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Account({ user, onSignOut }: { user: AuthUser; onSignOut?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (!onSignOut) return;
    setBusy(true);
    await onSignOut();
  }

  return (
    <div className="border-t pt-4">
      <p className="truncate text-sm font-semibold">{user.display_name}</p>
      <p className="mb-3 text-xs capitalize text-muted-foreground">{user.role}</p>
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={signOut}
        disabled={busy || !onSignOut}
      >
        <LogOut aria-hidden="true" />
        {busy ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}

function ConnectedWorkspaceShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, pathname, router, user]);

  if (loading || !user) {
    return (
      <div role="status" className="grid min-h-screen place-items-center text-muted-foreground">
        Loading inspection workspace…
      </div>
    );
  }

  return (
    <WorkspaceFrame
      user={user}
      onSignOut={async () => {
        await logout();
        router.replace('/login');
        router.refresh();
      }}
    >
      {children}
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({
  children,
  user,
  onSignOut,
}: {
  children: ReactNode;
  user: AuthUser;
  onSignOut?: () => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface text-ink antialiased flex flex-col selection:bg-terracotta selection:text-white">
      {/* Top System Telemetry Bar */}
      <div className="w-full bg-surface text-ink-muted px-4 sm:px-6 py-2 flex items-center justify-between border-b border-border text-xs font-mono">
        <div className="flex items-center space-x-2 text-[11px] sm:text-xs">
          <span className="w-2 h-2 rounded-full bg-forest animate-pulse"></span>
          <span className="text-ink font-mono">Analysis Engine Active // Rules 2011</span>
        </div>
        <div className="text-[11px] sm:text-xs text-ink-muted font-mono">
          Terminal: <strong className="text-ink uppercase">{user.username || 'admin'}</strong>
        </div>
      </div>

      <div className="flex-1 md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-md bg-terracotta px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-14"
        >
          Skip to main content
        </a>

        {/* Desktop Sidebar */}
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-[#EBE5DB] bg-white p-4 md:flex shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <Link href="/" className="flex min-h-11 items-center gap-3 rounded-md px-1 group">
              <span className="grid size-9 place-items-center rounded-[8px] bg-charcoal text-white shadow-sm transition-transform group-hover:scale-105">
                <ShieldCheck aria-hidden="true" className="size-5 text-terracotta" />
              </span>
              <span>
                <span className="block font-heading text-sm font-bold tracking-tight text-ink">LMPC Inspector</span>
                <span className="block text-[11px] font-mono text-ink-muted">Evidence workspace</span>
              </span>
            </Link>
            <ThemeToggle />
          </div>

          <Navigation user={user} />

          <div className="mt-auto pt-4 border-t border-[#EBE5DB]">
            <SyncStatusIndicator className="mb-3 w-full justify-center text-xs font-mono" />
            <Account user={user} onSignOut={onSignOut} />
          </div>
        </aside>

        {/* Main Content Area & Mobile Bar */}
        <div className="min-w-0 flex flex-col">
          <div className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-[#EBE5DB] bg-surface/95 px-4 backdrop-blur md:hidden">
            <Link href="/" className="flex min-h-11 items-center gap-2 font-heading font-bold text-sm text-ink">
              <ShieldCheck aria-hidden="true" className="size-5 text-terracotta" />
              LMPC Inspector
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <SyncStatusIndicator className="max-w-40 text-xs font-mono" />
              <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Open navigation" className="border-[#EBE5DB] bg-white">
                    <Menu aria-hidden="true" className="size-5 text-ink" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="left-auto right-0 top-0 h-dvh max-w-xs translate-x-0 translate-y-0 rounded-none p-5 bg-white border-l border-[#EBE5DB]">
                  <DialogTitle className="mb-6 flex items-center gap-2 font-heading text-base font-bold text-ink">
                    <ShieldCheck aria-hidden="true" className="size-5 text-terracotta" />
                    Inspection Workspace
                  </DialogTitle>
                  <Navigation user={user} onNavigate={() => setMenuOpen(false)} />
                  <div className="mt-auto pt-8 border-t border-[#EBE5DB]">
                    <Account user={user} onSignOut={onSignOut} />
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <main id="main-content" tabIndex={-1} className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export function WorkspaceShell({ children, user }: { children: ReactNode; user?: AuthUser }) {
  if (user) return <WorkspaceFrame user={user}>{children}</WorkspaceFrame>;
  return <ConnectedWorkspaceShell>{children}</ConnectedWorkspaceShell>;
}
