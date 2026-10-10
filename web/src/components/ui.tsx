import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '../lib/cn';

export function Pill({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn('pill', className)} title={title}>
      {children}
    </span>
  );
}

export function SectionHeading({
  title,
  count,
  action,
  className,
}: {
  title: string;
  count?: number | string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <h2 className="section-title">
        {title}
        {count !== undefined && count !== '' && (
          <span className="ml-2 font-normal normal-case tracking-normal text-muted">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}

/**
 * Empty states are designed, not incidental (spec 42): an icon to anchor the
 * block, what is missing, and the next step. Following Cal.com, the icon sits
 * in a soft circle rather than floating on the ground.
 */
export function EmptyState({
  title,
  body,
  action,
  compact,
  icon: Icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline bg-raised/30 text-center',
        compact ? 'px-4 py-7' : 'px-6 py-14'
      )}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className={cn(
            'mb-3 grid place-items-center rounded-full bg-raised text-faint',
            compact ? 'h-10 w-10' : 'h-14 w-14'
          )}
        >
          <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        </span>
      )}
      <p className={cn('font-semibold text-ink', compact ? 'text-sm' : 'text-base')}>{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-edge border-t-accent" />
    </span>
  );
}

/** Low-key skeletons keep layout stable while data arrives. */
export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl border border-hairline bg-raised/60" />
      ))}
    </div>
  );
}

export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-error-edge bg-error-wash px-4 py-3 text-sm text-error-text"
    >
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-sm btn-outline mt-2.5">
          Try again
        </button>
      )}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-error-text">{message}</p>;
}

/** A checkbox / progress toggle: unchecked, half done, complete (spec 11). */
export function StatusCheckbox({
  status,
  onClick,
  disabled,
  label,
}: {
  status: 'not_started' | 'in_progress' | 'completed';
  onClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  const interactive = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-pressed={status === 'completed'}
      aria-label={`${label} - ${status.replace('_', ' ')}${interactive ? ', change status' : ''}`}
      className={cn(
        'mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors',
        status === 'completed'
          ? 'border-success bg-success text-white animate-check-pop'
          : status === 'in_progress'
            ? 'border-attention bg-attention/15 text-attention-text'
            : 'border-edge bg-surface text-transparent',
        interactive && 'hover:border-accent focus-visible:border-accent',
        !interactive && 'cursor-default'
      )}
    >
      {status === 'completed' ? (
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : status === 'in_progress' ? (
        <span className="h-2 w-2 rounded-full bg-attention" />
      ) : null}
    </button>
  );
}
