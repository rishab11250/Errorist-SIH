'use client';

import { ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { LoginForm } from '@/components/auth/LoginForm';
import { safeNextPath } from '@/lib/api-client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeNextPath(searchParams.get('next'));

  return (
    <div className="bg-surface text-charcoal font-body min-h-screen flex flex-col justify-between relative overflow-x-hidden selection:bg-amberAccent selection:text-white">
      {/* Decorative Ambient Radial Glow */}
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#f1e5d7] via-transparent to-transparent"></div>

      {/* Top System Header */}
      <header className="w-full border-b border-[#e5ded4] bg-surface/90 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between z-10">
        <Link href="/" className="flex items-center gap-2.5 font-heading font-bold text-sm text-ink group min-w-0">
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[7px] shadow-sm transition-transform group-hover:scale-105">
            <Image src="/icons/icon.svg" alt="CLAIR logo" width={32} height={32} className="size-full object-cover" priority />
          </span>
          <span className="min-w-0">
            <span className="block font-heading text-sm font-bold tracking-tight text-ink">CLAIR</span>
            <span className="block text-[10px] font-mono text-ink-muted -mt-0.5 truncate">Inspection Workspace</span>
          </span>
        </Link>
        <div className="hidden xs:flex items-center gap-2 text-xs font-medium text-amberAccent font-mono shrink-0">
          <span className="w-2 h-2 rounded-full bg-amberAccent animate-ping"></span>
          Field Terminal Gateway
        </div>
      </header>

      {/* Main Centered Card Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10 my-auto">
        <div className="w-full max-w-md bg-white border border-[#e8dfd3] rounded-[10px] shadow-[0_12px_32px_-8px_rgba(28,27,25,0.08)] p-5 sm:p-8 relative overflow-hidden transition-all hover:shadow-[0_18px_40px_-10px_rgba(28,27,25,0.12)]">
          {/* Angled Decorative Accent in Card Header */}
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-[#faeee5] rounded-full blur-xl pointer-events-none"></div>

          {/* Brand Mark & Title */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="w-14 h-14 rounded-[12px] overflow-hidden flex items-center justify-center mb-3.5 shadow-md shadow-charcoal/10 relative">
              <Image src="/icons/icon.svg" alt="CLAIR logo" width={56} height={56} className="size-full object-cover" priority />
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-forestConfirm rounded-full border-2 border-white"></span>
            </div>
            <h1 className="text-2xl font-bold font-heading tracking-tight text-charcoal">
              CLAIR
            </h1>
            <p className="text-xs text-charcoal/70 mt-1 font-medium">
              Inspection & Compliance Workspace
            </p>
          </div>

          <LoginForm
            onAuthenticated={() => {
              router.replace(destination);
              router.refresh();
            }}
          />

          {/* Closed internal tool note */}
          <div className="mt-6 pt-4 border-t border-[#f0e9df] text-center">
            <p className="text-[11px] text-charcoal/50 flex items-center justify-center gap-1.5 font-medium">
              <svg className="w-3.5 h-3.5 text-charcoal/40" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"></path>
              </svg>
              Restricted legal compliance portal — authorized field officers only.
            </p>
          </div>
        </div>
      </main>

      <footer className="w-full text-center py-3 text-[11px] text-charcoal/40 z-10 font-mono">
        CLAIR v3.4.2 (Commodity Label Audit & Inspection Recognition · LMPC Rules 2011)
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<main className="grid min-h-screen place-items-center bg-surface text-charcoal font-heading">Loading sign in…</main>}
    >
      <LoginContent />
    </Suspense>
  );
}
