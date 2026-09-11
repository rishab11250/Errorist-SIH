'use client';

import { useMemo, useState } from 'react';
import { Eye, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface EvidenceCropProps {
  imageSrc: string;
  bbox?: [number, number, number, number] | null;
  citation?: string;
  className?: string;
  onExpand?: () => void;
}

export function EvidenceCrop({
  imageSrc,
  bbox,
  citation = 'Packaging declaration',
  className,
  onExpand,
}: EvidenceCropProps) {
  const [imageError, setImageError] = useState(false);

  const crop = useMemo(() => {
    if (!bbox || bbox.length !== 4) return null;
    const [bx, by, bw, bh] = bbox;

    // Validate box values
    if (bw <= 0 || bh <= 0 || bx < 0 || by < 0) return null;

    // Contextual padding (25% on horizontal, 35% on vertical, min 3% margin)
    const padX = Math.max(bw * 0.25, 0.03);
    const padY = Math.max(bh * 0.35, 0.03);

    const minX = Math.max(0, bx - padX);
    const minY = Math.max(0, by - padY);
    const maxX = Math.min(1, bx + bw + padX);
    const maxY = Math.min(1, by + bh + padY);

    const cropW = Math.max(0.01, maxX - minX);
    const cropH = Math.max(0.01, maxY - minY);

    return {
      minX,
      minY,
      cropW,
      cropH,
      bx,
      by,
      bw,
      bh,
    };
  }, [bbox]);

  if (!bbox || !crop || imageError) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/30 p-4 text-center text-xs text-muted-foreground',
          className
        )}
        data-testid="evidence-crop-fallback"
      >
        <ImageIcon className="size-6 text-muted-foreground/60 mb-1.5" aria-hidden="true" />
        <span className="font-medium">No localized bounding box on packaging</span>
        <span className="text-[11px] text-muted-foreground/80 mt-0.5">
          Verify against full evidence image or physical item.
        </span>
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
          >
            <Eye className="size-3" /> View full photo
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border border-border/70 bg-black/5 shadow-xs transition-all',
        className
      )}
      data-testid="evidence-crop"
    >
      <div className="relative aspect-[16/7] w-full max-h-40 overflow-hidden bg-muted/40">
        <svg
          viewBox={`${crop.minX} ${crop.minY} ${crop.cropW} ${crop.cropH}`}
          preserveAspectRatio="xMidYMid meet"
          className="size-full object-contain"
          role="img"
          aria-label={`Evidence crop for ${citation}`}
        >
          {/* Target image mapped to unit coordinate space */}
          <image
            href={imageSrc}
            x="0"
            y="0"
            width="1"
            height="1"
            preserveAspectRatio="none"
            onError={() => setImageError(true)}
          />

          {/* Highlight target bounding box with purple review styling */}
          <rect
            x={crop.bx}
            y={crop.by}
            width={crop.bw}
            height={crop.bh}
            fill="rgba(168, 85, 247, 0.18)"
            stroke="#a855f7"
            strokeWidth={crop.cropW * 0.018}
            strokeDasharray={`${crop.cropW * 0.02} ${crop.cropW * 0.015}`}
            vectorEffect="non-scaling-stroke"
            rx={crop.cropW * 0.005}
          />
        </svg>

        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            title="Inspect in full annotated evidence"
            aria-label="Inspect evidence in full photo"
            className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-xs opacity-80 hover:opacity-100 transition-opacity"
          >
            <Eye className="size-3 text-primary" />
            <span>Inspect</span>
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-review">
          Evidence snippet
        </span>
        <span className="truncate max-w-[150px]">{citation}</span>
      </div>
    </div>
  );
}
