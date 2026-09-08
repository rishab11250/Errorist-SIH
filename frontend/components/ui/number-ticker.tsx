'use client';

import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

import { cn } from '@/lib/cn';

interface NumberTickerProps extends ComponentPropsWithoutRef<'span'> {
  value: number;
  startValue?: number;
  delay?: number;
  decimalPlaces?: number;
  locale?: string;
}

function formatNumber(value: number, decimalPlaces: number, locale: string) {
  return Intl.NumberFormat(locale, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(value.toFixed(decimalPlaces)));
}

export function NumberTicker({
  value,
  startValue = 0,
  delay = 0,
  decimalPlaces = 0,
  locale = 'en-IN',
  className,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(startValue);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: '0px' });

  useEffect(() => {
    if (reduceMotion) {
      if (ref.current) ref.current.textContent = formatNumber(value, decimalPlaces, locale);
      return;
    }
    if (!isInView) return;
    const timer = window.setTimeout(() => motionValue.set(value), delay * 1000);
    return () => window.clearTimeout(timer);
  }, [decimalPlaces, delay, isInView, locale, motionValue, reduceMotion, value]);

  useEffect(
    () =>
      springValue.on('change', (latest) => {
        if (ref.current && !reduceMotion) {
          ref.current.textContent = formatNumber(latest, decimalPlaces, locale);
        }
      }),
    [decimalPlaces, locale, reduceMotion, springValue]
  );

  return (
    <span
      ref={ref}
      className={cn('inline-block tabular-nums tracking-tight', className)}
      {...props}
    >
      {formatNumber(reduceMotion ? value : startValue, decimalPlaces, locale)}
    </span>
  );
}
