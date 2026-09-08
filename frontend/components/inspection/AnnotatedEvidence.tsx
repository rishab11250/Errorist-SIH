import { denormaliseBbox } from '@/lib/bbox';
import type { Verdict } from '@/lib/types';

const strokes: Record<Verdict['status'], string> = {
  pass: '#15803d',
  fail: '#b91c1c',
  warn: '#b45309',
  manual_review: '#7e22ce',
  na: '#475569',
};

interface AnnotatedEvidenceProps {
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  verdicts: Verdict[];
  activeRuleId: string | null;
}

export function AnnotatedEvidence({
  imageSrc,
  imageWidth,
  imageHeight,
  verdicts,
  activeRuleId,
}: AnnotatedEvidenceProps) {
  return (
    <figure className="space-y-3">
      <div className="relative overflow-hidden rounded-md bg-muted">
        <img src={imageSrc} alt="Inspection evidence" className="h-auto w-full" />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          viewBox={`0 0 ${imageWidth} ${imageHeight}`}
          preserveAspectRatio="none"
        >
          {verdicts.flatMap((verdict) =>
            verdict.evidence_bboxes.map((bbox, index) => {
              const box = denormaliseBbox(bbox, imageWidth, imageHeight);
              const active = verdict.rule_id === activeRuleId;
              return (
                <rect
                  key={`${verdict.rule_id}-${index}`}
                  data-testid={`evidence-box-${verdict.rule_id}-${index}`}
                  data-active={active ? 'true' : 'false'}
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill={active ? `${strokes[verdict.status]}22` : 'transparent'}
                  stroke={strokes[verdict.status]}
                  strokeWidth={active ? 5 : 2}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })
          )}
        </svg>
      </div>
      <figcaption className="text-sm text-muted-foreground">
        Select a finding to emphasize its matching evidence boxes. Status is also shown in text.
      </figcaption>
    </figure>
  );
}
