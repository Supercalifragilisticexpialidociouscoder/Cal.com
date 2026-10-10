import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';
import { ChevronLeftIcon } from './icons';

/**
 * The same header on every page: title, one line of context, actions on the
 * right, and a rule beneath. Repeating it is what makes the pages feel like
 * one product rather than a set of screens.
 */
export function PageHeader({
  title,
  description,
  actions,
  backTo,
  backLabel,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header className={cn('mb-5', className)}>
      {backTo && (
        <Link
          to={backTo}
          className="mb-2 -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          {backLabel ?? 'Back'}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-ink sm:text-xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
