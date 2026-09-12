import type { Conflict } from '../api/types';
import { formatMediumDate, formatTimeRange } from '../lib/date';

/**
 * The conflict warning (spec 23, 24). It states the clash plainly and always
 * leaves the decision with the administrator.
 */
export function ConflictWarning({
  conflicts,
  message,
  onOverride,
  onCancel,
  overrideLabel = 'Save anyway',
  busy,
}: {
  conflicts: Conflict[];
  message: string;
  onOverride?: () => void;
  onCancel?: () => void;
  overrideLabel?: string;
  busy?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/35 bg-amber-50 p-3.5 text-sm dark:bg-amber-400/[0.07]"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-800 dark:text-amber-200"
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900 dark:text-amber-100">{message}</p>

          {conflicts.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {conflicts.map((conflict, index) => (
                <li
                  key={`${conflict.kind}-${conflict.event_id}-${index}`}
                  className="rounded-lg bg-surface/70 px-2.5 py-2 text-xs text-ink dark:bg-black/20"
                >
                  {conflict.kind === 'venue' ? (
                    <>
                      <span className="font-medium">{conflict.title}</span>
                      <span className="text-muted">
                        {' '}
                        &middot; {formatMediumDate(conflict.event_date)} &middot;{' '}
                        {formatTimeRange(conflict.start_time, conflict.end_time, conflict.all_day)}
                        {conflict.location ? ` · ${conflict.location}` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{conflict.team}</span>
                      <span className="text-muted">
                        {' '}
                        is on &ldquo;{conflict.responsibility_title}&rdquo; for{' '}
                        {conflict.event_title} &middot; {formatMediumDate(conflict.event_date)}
                        {conflict.start_time
                          ? ` · ${formatTimeRange(conflict.start_time, conflict.end_time)}`
                          : ''}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(onOverride || onCancel) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onOverride && (
                <button type="button" onClick={onOverride} disabled={busy} className="btn btn-sm btn-primary">
                  {busy ? 'Saving...' : overrideLabel}
                </button>
              )}
              {onCancel && (
                <button type="button" onClick={onCancel} disabled={busy} className="btn btn-sm btn-outline">
                  Go back and change it
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
