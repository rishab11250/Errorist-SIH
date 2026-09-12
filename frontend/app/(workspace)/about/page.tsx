import { ArrowUpRight, CheckCircle2, ScanLine, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const principles = [
  {
    title: 'Evidence first',
    description: 'Every finding stays anchored to the label evidence that produced it.',
    icon: ScanLine,
  },
  {
    title: 'Rules you can inspect',
    description: 'Compliance decisions are measured against explicit LMPC requirements.',
    icon: ShieldCheck,
  },
  {
    title: 'Human when it matters',
    description: 'Ambiguous results remain visible for review instead of being hidden in a score.',
    icon: CheckCircle2,
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      <header className="border-b border-[#EBE5DB] pb-8">
        <div className="mb-3 flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-kinetic-terracotta">
          <span className="h-1.5 w-1.5 rounded-full bg-kinetic-terracotta" />
          System profile // CLAIR
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-kinetic-charcoal sm:text-4xl">
              Clarity for every label.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-kinetic-textMuted sm:text-base">
              CLAIR is a focused inspection workspace for making packaged-commodity label audits faster,
              more consistent, and easier to explain.
            </p>
          </div>
          <div className="border-l-2 border-kinetic-terracotta pl-4 font-mono text-xs leading-6 text-kinetic-textMuted">
            <p className="font-semibold text-kinetic-charcoal">Commodity Label Audit</p>
            <p>Inspection Recognition</p>
            <p className="mt-2 text-kinetic-terracotta">STATUS: OPERATIONAL</p>
          </div>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]" aria-labelledby="mission-heading">
        <div className="rounded-kinetic border border-[#EBE5DB] bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-kinetic-terracotta">
            Our mission
          </p>
          <h2 id="mission-heading" className="font-display text-xl font-bold text-kinetic-charcoal sm:text-2xl">
            Turn a visual check into a defensible decision.
          </h2>
          <p className="mt-4 text-sm leading-7 text-kinetic-textMuted">
            Label compliance work should not depend on guesswork, scattered notes, or a result that cannot be
            retraced. CLAIR brings capture, OCR, rule evaluation, evidence, and review into one calm workspace.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-kinetic-sm bg-kinetic-terracotta px-4 py-2.5 font-mono text-xs font-semibold text-white transition hover:bg-kinetic-terracottaHover"
          >
            Start an inspection
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <div className="rounded-kinetic border border-[#EBE5DB] bg-[#FAF8F3] p-6 sm:p-8">
          <p className="mb-5 font-mono text-xs font-semibold uppercase tracking-wider text-kinetic-textMuted">
            Built around the audit trail
          </p>
          <ol className="space-y-5">
            <li className="flex gap-4">
              <span className="font-mono text-xs text-kinetic-terracotta">01</span>
              <div>
                <p className="text-sm font-bold text-kinetic-charcoal">Capture</p>
                <p className="mt-1 text-xs leading-5 text-kinetic-textMuted">Bring the label into focus.</p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="font-mono text-xs text-kinetic-terracotta">02</span>
              <div>
                <p className="text-sm font-bold text-kinetic-charcoal">Compare</p>
                <p className="mt-1 text-xs leading-5 text-kinetic-textMuted">Read it against the rules.</p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="font-mono text-xs text-kinetic-terracotta">03</span>
              <div>
                <p className="text-sm font-bold text-kinetic-charcoal">Review</p>
                <p className="mt-1 text-xs leading-5 text-kinetic-textMuted">Keep the reasoning visible.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section aria-labelledby="principles-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-kinetic-terracotta">
              Operating principles
            </p>
            <h2 id="principles-heading" className="mt-1 font-display text-xl font-bold text-kinetic-charcoal">
              Designed for trust.
            </h2>
          </div>
          <p className="hidden font-mono text-xs text-kinetic-textMuted sm:block">CLAIR / 2011 RULESET</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {principles.map(({ title, description, icon: Icon }) => (
            <article key={title} className="card-lift rounded-kinetic border border-[#EBE5DB] bg-white p-5 shadow-sm">
              <Icon aria-hidden="true" className="size-5 text-kinetic-terracotta" />
              <h3 className="mt-5 font-display text-base font-bold text-kinetic-charcoal">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-kinetic-textMuted">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#EBE5DB] pt-5 font-mono text-[11px] text-kinetic-textMuted">
        CLAIR is a compliance workspace for inspection teams. Keep the evidence close, and the decision clear.
      </footer>
    </div>
  );
}