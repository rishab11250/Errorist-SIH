'use client';

import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/cn';

export interface ScanStage {
  id: string;
  label: string;
}

interface ScanProgressProps {
  stages: readonly ScanStage[];
  currentStage: number;
  className?: string;
}

export function ScanProgress({ stages, currentStage, className }: ScanProgressProps) {
  const reduceMotion = useReducedMotion();
  const boundedStage = Math.max(0, Math.min(currentStage, stages.length));

  return (
    <ol
      aria-label={`Inspection progress: step ${Math.min(boundedStage + 1, stages.length)} of ${stages.length}`}
      className={cn('flex w-full items-start', className)}
    >
      {stages.map((stage, index) => {
        const complete = index < boundedStage;
        const current = index === boundedStage;
        const state = complete ? 'Complete' : current ? 'In progress' : 'Waiting';
        return (
          <li
            key={stage.id}
            aria-current={current ? 'step' : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
          >
            {index > 0 ? (
              <span className="absolute right-1/2 top-[1.35rem] h-0.5 w-full -translate-y-1/2 bg-muted">
                <motion.span
                  aria-hidden="true"
                  animate={{ scaleX: complete || current ? 1 : 0 }}
                  className="block h-full origin-left bg-primary"
                  initial={false}
                  transition={{ duration: reduceMotion ? 0 : 0.25 }}
                />
              </span>
            ) : null}
            <span
              className={cn(
                'relative z-10 flex size-11 items-center justify-center rounded-full border-2 bg-background font-heading text-sm font-semibold',
                complete && 'border-pass bg-pass text-white',
                current && 'border-primary text-primary',
                !complete && !current && 'border-border text-muted-foreground',
              )}
            >
              {complete ? <Check aria-hidden="true" className="size-5" /> : index + 1}
              <span className="sr-only">{state}</span>
            </span>
            <span className="max-w-28 text-sm font-semibold text-foreground">{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
