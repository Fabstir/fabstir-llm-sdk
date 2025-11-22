'use client';

import { cn } from '@/lib/utils';

export interface ProgressProps {
  value: number; // 0-100
  className?: string;
  indicatorClassName?: string;
}

/**
 * Simple Progress Bar Component
 *
 * Displays a linear progress bar with a percentage value.
 */
export function Progress({ value, className, indicatorClassName }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-gray-200',
        className
      )}
    >
      <div
        className={cn(
          'h-full bg-blue-600 transition-all duration-300 ease-in-out',
          indicatorClassName
        )}
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
}
