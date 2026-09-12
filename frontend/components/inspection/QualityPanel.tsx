import { CheckCircle2, CircleAlert, CircleHelp, Camera } from 'lucide-react';

import type { QualityStatus, QualitySummary } from '@/lib/types';

const qualityPresentation: Record<
  QualityStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  acceptable: {
    label: 'Image quality acceptable',
    className: 'border-pass/30 bg-pass/10',
    icon: CheckCircle2,
  },
  usable_with_warnings: {
    label: 'Usable with warnings',
    className: 'border-warn/30 bg-warn/10',
    icon: CircleAlert,
  },
  retake_recommended: {
    label: 'Retake recommended',
    className: 'border-warn/30 bg-warn/10',
    icon: Camera,
  },
  unreadable: {
    label: 'Image unreadable',
    className: 'border-fail/30 bg-fail/10',
    icon: CircleHelp,
  },
};

export function QualityPanel({ quality }: { quality: QualitySummary | null }) {
  if (!quality) {
    return <section className="rounded-lg border p-5"><h2 className="font-semibold">Image assessment unavailable</h2><p>The synced snapshot does not include a quality assessment. Its captured verdicts are preserved.</p></section>;
  }
  const item = qualityPresentation[quality.status];
  const Icon = item.icon;
  return (
    <section
      aria-labelledby="quality-heading"
      className={`rounded-lg border p-5 ${item.className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon aria-hidden="true" className="size-6" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider">Image assessment</p>
            <h2 id="quality-heading" className="font-heading text-lg font-semibold">
              {item.label}
            </h2>
          </div>
        </div>
        <p className="rounded-full bg-background/80 px-3 py-1 text-sm font-semibold">
          Quality score{' '}
          {quality.score > 1 ? Math.round(quality.score) : Math.round(quality.score * 100)}%
        </p>
      </div>
      {quality.guidance.length ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          {quality.guidance.map((guidance) => (
            <li key={guidance}>{guidance}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm">The evidence is suitable for automated inspection.</p>
      )}
    </section>
  );
}
