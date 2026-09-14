import type { Readiness } from '../api/types';
import { cn } from '../lib/cn';
import { READINESS_BAR, READINESS_LABELS, READINESS_TEXT } from '../lib/taxonomy';

/**
 * Event readiness (spec 12). Deliberately quiet: one thin bar, one number and
 * one word - never a dashboard of gauges.
 */
export function ReadinessBar({
  readiness,
  size = 'md',
  showLabel = true,
  className,
}: {
  readiness: Readiness;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'flex items-baseline justify-between gap-2',
          size === 'sm' ? 'text-2xs' : 'text-xs'
        )}
      >
        <span className="font-medium text-muted">
          {readiness.completed} / {readiness.total} completed
        </span>
        {showLabel && (
          <span className={cn('font-semibold', READINESS_TEXT[readiness.label])}>
            {READINESS_LABELS[readiness.label]}
          </span>
        )}
      </div>
      <div
        className={cn('mt-1.5 w-full overflow-hidden rounded-full bg-raised', size === 'sm' ? 'h-1' : 'h-1.5')}
        role="progressbar"
        aria-valuenow={readiness.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Event readiness: ${readiness.percent}% complete`}
      >
        <div
          className={cn('h-full origin-left rounded-full animate-bar-grow', READINESS_BAR[readiness.label])}
          style={{ width: `${readiness.percent}%` }}
        />
      </div>
    </div>
  );
}

/** A single line summary used where a full bar would be too much. */
export function ReadinessInline({ readiness }: { readiness: Readiness }) {
  return (
    <span className={cn('text-2xs font-medium', READINESS_TEXT[readiness.label])}>
      {readiness.completed}/{readiness.total} responsibilities complete
    </span>
  );
}
