'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { LoginForm } from '@/components/auth/LoginForm';
import { Spotlight } from '@/components/ui/spotlight';
import { safeNextPath } from '@/lib/api-client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeNextPath(searchParams.get('next'));

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <Spotlight />
      <section className="surface-panel relative z-10 w-full max-w-md p-6 sm:p-8">
        <div className="mb-7">
          <span className="mb-4 grid size-11 place-items-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </span>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Secure workspace</p>
          <h1 className="mt-2 text-h1">Sign in to LMPC Inspector</h1>
          <p className="mt-3 text-muted-foreground">
            Access inspections, evidence, review history, and auditable reports.
          </p>
        </div>
        <LoginForm
          onAuthenticated={() => {
            router.replace(destination);
            router.refresh();
          }}
        />
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center">Loading sign in…</main>}>
      <LoginContent />
    </Suspense>
  );
}
