import { denormaliseBbox } from '@/lib/bbox';
import Image from 'next/image';
import type { OCRWord, Verdict } from '@/lib/types';

const strokeColors: Record<Verdict['status'], string> = {
  pass: '#10b981',
  fail: '#ef4444',
  warn: '#f59e0b',
  manual_review: '#a855f7',
  na: '#64748b',
};

interface AnnotatedEvidenceProps {
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  verdicts: Verdict[];
  activeRuleId: string | null;
  ocrWords?: OCRWord[];
}

export function AnnotatedEvidence({
  imageSrc,
  imageWidth,
  imageHeight,
  verdicts,
  activeRuleId,
  ocrWords = [],
}: AnnotatedEvidenceProps) {
  const detectedWords = ocrWords.filter(
    (word) => word.text.trim() && word.bbox[2] > 0 && word.bbox[3] > 0
  );
  const readableCount = detectedWords.filter((word) => word.confidence >= 0.3).length;
  return (
    <figure className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted shadow-sm">
        <Image
          src={imageSrc}
          alt="Inspection evidence"
          width={imageWidth}
          height={imageHeight}
          unoptimized
          className="h-auto w-full object-contain"
        />
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
          viewBox={`0 0 ${imageWidth} ${imageHeight}`}
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="evidence-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="1.5"
                floodColor="#000000"
                floodOpacity="0.85"
              />
            </filter>
            <filter id="active-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="3"
                floodColor="#000000"
                floodOpacity="0.9"
              />
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {detectedWords.map((word, index) => {
            const box = denormaliseBbox(word.bbox, imageWidth, imageHeight);
            return (
              <rect
                key={`ocr-${index}`}
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                fill="rgba(14, 165, 233, 0.05)"
                stroke={word.confidence >= 0.3 ? '#0ea5e9' : '#f59e0b'}
                strokeWidth="1"
                strokeOpacity={Math.max(0.35, word.confidence)}
                vectorEffect="non-scaling-stroke"
                rx="1"
              >
                <title>{`${word.text} (${Math.round(word.confidence * 100)}%)`}</title>
              </rect>
            );
          })}
          {verdicts.flatMap((verdict) =>
            verdict.evidence_bboxes.map((bbox, index) => {
              const box = denormaliseBbox(bbox, imageWidth, imageHeight);
              const active = verdict.rule_id === activeRuleId;
              const color = strokeColors[verdict.status] ?? '#64748b';
              const isDashed = verdict.status === 'fail';
              const isDotted = verdict.status === 'manual_review';

              return (
                <g key={`${verdict.rule_id}-${index}`}>
                  {/* Outer dark stroke for guaranteed contrast against white backgrounds */}
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    fill="transparent"
                    stroke="#000000"
                    strokeWidth={active ? 6 : 3.5}
                    strokeOpacity={0.6}
                    vectorEffect="non-scaling-stroke"
                    rx={2}
                  />
                  {/* Main colored bounding box */}
                  <rect
                    data-testid={`evidence-box-${verdict.rule_id}-${index}`}
                    data-active={active ? 'true' : 'false'}
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    fill={active ? `${color}33` : 'transparent'}
                    stroke={color}
                    strokeWidth={active ? 4 : 2}
                    strokeDasharray={isDashed ? '6 3' : isDotted ? '2 2' : undefined}
                    filter={active ? 'url(#active-glow)' : 'url(#evidence-shadow)'}
                    vectorEffect="non-scaling-stroke"
                    rx={2}
                  />
                </g>
              );
            })
          )}
        </svg>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {detectedWords.length} OCR tokens outlined ({readableCount} readable-confidence). Select a
          finding to highlight its evidence.
        </span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500" /> Pass
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
            <span className="size-2 rounded-full border border-red-500 bg-red-500/30" /> Fail
            (dashed)
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            <span className="size-2 rounded-full bg-amber-500" /> Warning
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-purple-600 dark:text-purple-400">
            <span className="size-2 rounded-full border border-purple-500 bg-purple-500/30" />{' '}
            Review (dotted)
          </span>
        </div>
      </figcaption>
      {detectedWords.length > 0 ? (
        <details className="rounded-md border border-white/15 bg-black/30 p-3 text-xs text-neutral-200">
          <summary className="cursor-pointer font-semibold">View complete OCR transcript</summary>
          <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap leading-relaxed">
            {detectedWords.map((word) => word.text).join(' ')}
          </p>
        </details>
      ) : null}
    </figure>
  );
}
