import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '../api/useQuery';
import { cn } from '../lib/cn';
import type { EventDetail } from '../api/types';
import {
  formatDistanceInDays,
  formatFullDate,
  formatTimeRange,
  todayISO,
} from '../lib/date';
import { EVENT_TYPE_LABELS, STATUS_LABELS, STATUS_PILL, eventPill } from '../lib/taxonomy';
import { useAuth } from '../state/AuthContext';
import { useTaskToggle } from '../state/useTaskToggle';
import {
  ArrowRightIcon,
  CalendarIcon,
  CloseIcon,
  EditIcon,
  MapPinIcon,
  UsersIcon,
} from './icons';
import { ReadinessBar } from './ReadinessBar';
import { Pill, SkeletonRows, StatusCheckbox } from './ui';

/**
 * A peek at an event without leaving the calendar.
 *
 * Opening a full page to answer "what time is this and who is on it" loses
 * your place in the month you were reading. This slides in over it, and the
 * checklist is live - an admin can tick work off from here.
 */
export function EventSheet({
  eventId,
  onClose,
}: {
  eventId: number | null;
  onClose: () => void;
}) {
  const { isAdmin } = useAuth();
  const { toggle } = useTaskToggle();
  const today = todayISO();

  const { data, loading, reload } = useQuery<EventDetail>(
    eventId ? `/events/${eventId}` : null,
    { staleMs: isAdmin ? 3_000 : 30_000 }
  );

  useEffect(() => {
    if (eventId === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
    };
  }, [eventId, onClose]);

  if (eventId === null) return null;

  const event = data?.event;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={event?.title ?? 'Event'}
        className="relative flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-overlay animate-slide-in-right"
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0 flex-1">
            {event ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill className={eventPill(event)}>{event.organizer_name}</Pill>
                  <Pill className="border-hairline bg-raised text-muted">
                    {EVENT_TYPE_LABELS[event.event_type]}
                  </Pill>
                  {event.important && (
                    <Pill className="border-transparent bg-accent text-accent-ink">Important</Pill>
                  )}
                </div>
                <h2 className="mt-2 text-base font-semibold leading-snug text-ink">{event.title}</h2>
              </>
            ) : (
              <div className="h-6 w-40 animate-pulse rounded bg-raised" />
            )}
          </div>
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost px-1.5" aria-label="Close">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-slim flex-1 overflow-y-auto px-5 py-4">
          {loading && !data ? (
            <SkeletonRows rows={4} />
          ) : event ? (
            <div className="space-y-5">
              <dl className="space-y-2.5 text-sm">
                <Row Icon={CalendarIcon}>
                  <span className="text-ink">{formatFullDate(event.event_date)}</span>
                  <span className="ml-1.5 text-xs text-faint">
                    {formatDistanceInDays(event.event_date, today)}
                  </span>
                </Row>
                <Row Icon={CalendarIcon} hideIcon>
                  {formatTimeRange(event.start_time, event.end_time, event.all_day)}
                </Row>
                {event.location && <Row Icon={MapPinIcon}>{event.location}</Row>}
                <Row Icon={UsersIcon}>{event.organizer_name}</Row>
              </dl>

              <div className="flex flex-wrap items-center gap-2">
                <Pill className={STATUS_PILL[event.status]}>{STATUS_LABELS[event.status]}</Pill>
                {event.is_public === false && (
                  <Pill className="border-hairline bg-raised text-muted">Internal</Pill>
                )}
              </div>

              {event.description && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                  {event.description}
                </p>
              )}

              {event.readiness && (
                <section className="rounded-xl border border-hairline p-3.5">
                  <div className="mb-2 flex items-baseline justify-between">
                    <h3 className="text-xs font-semibold text-ink">Event readiness</h3>
                    <span className="text-lg font-semibold tabular-nums text-ink">
                      {event.readiness.percent}%
                    </span>
                  </div>
                  <ReadinessBar readiness={event.readiness} />
                </section>
              )}

              {data.responsibilities.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold text-ink">
                    {isAdmin ? 'Responsibilities' : 'What is being organised'}
                  </h3>
                  <ul className="divide-y divide-hairline rounded-xl border border-hairline">
                    {data.responsibilities.map((responsibility) => (
                      <li
                        key={responsibility.id}
                        className="flex items-start gap-2.5 px-3 py-2.5"
                      >
                        <StatusCheckbox
                          status={responsibility.status}
                          label={responsibility.title}
                          onClick={
                            isAdmin
                              ? () =>
                                  void toggle(responsibility.id, responsibility.status, {
                                    eventId: event.id,
                                    title: responsibility.title,
                                    onSettled: reload,
                                  })
                              : undefined
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-sm',
                              responsibility.status === 'completed'
                                ? 'text-muted line-through'
                                : 'text-ink'
                            )}
                          >
                            {responsibility.title}
                          </span>
                          <span className="block truncate text-2xs text-muted">
                            {responsibility.assigned_to}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : null}
        </div>

        {event && (
          <div className="flex items-center gap-2 border-t border-hairline bg-raised/40 px-5 py-3">
            <Link to={`/events/${event.id}`} className="btn btn-md btn-outline flex-1" onClick={onClose}>
              Open full page
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
            {isAdmin && (
              <Link
                to={`/admin/events/${event.id}/edit`}
                className="btn btn-md btn-primary"
                onClick={onClose}
              >
                <EditIcon className="h-4 w-4" />
                Edit
              </Link>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function Row({
  Icon,
  children,
  hideIcon,
}: {
  Icon: typeof CalendarIcon;
  children: React.ReactNode;
  hideIcon?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-4 shrink-0 text-faint">{hideIcon ? null : <Icon className="h-4 w-4" />}</span>
      <span className="min-w-0 flex-1 text-muted">{children}</span>
    </div>
  );
}
