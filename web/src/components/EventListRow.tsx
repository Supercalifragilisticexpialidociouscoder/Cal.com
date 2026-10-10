import { Link } from 'react-router-dom';
import type { CalendarEvent } from '../api/types';
import { cn } from '../lib/cn';
import {
  WEEKDAY_SHORT,
  formatDayNumber,
  formatTime,
  formatTimeRange,
  parseISO,
} from '../lib/date';
import { EVENT_TYPE_LABELS, STATUS_LABELS, STATUS_PILL, eventAccent, eventPill } from '../lib/taxonomy';
import { peekProps, type OpenEvent } from './EventPeek';
import { ArrowRightIcon, EditIcon, MapPinIcon } from './icons';
import { ReadinessInline } from './ReadinessBar';
import { Pill } from './ui';

/**
 * One event as a full-width row in a bordered list.
 *
 * Cards in a grid look tidy and scan badly: the eye has to re-find the date
 * on every tile. A list puts the date in a fixed left column, so a hundred
 * events read as a single column of dates with titles beside them.
 */
export function EventListRow({
  event,
  open,
  isAdmin,
}: {
  event: CalendarEvent;
  open: OpenEvent | null;
  isAdmin: boolean;
}) {
  const parsed = parseISO(event.event_date);
  const isDeadline = event.event_type === 'deadline';

  return (
    <li className="group/row relative">
      <Link
        to={`/events/${event.id}`}
        {...peekProps(open, event.id)}
        className={cn(
          'flex items-center gap-3 px-3 py-3 transition-colors hover:bg-raised/60 sm:gap-4 sm:px-4',
          event.status === 'cancelled' && 'opacity-65'
        )}
      >
        <span
          aria-hidden="true"
          className={cn('h-9 w-[3px] shrink-0 rounded-full', eventAccent(event))}
        />

        <span className="w-11 shrink-0 text-center">
          <span className="block text-2xs font-semibold uppercase tracking-wider text-faint">
            {WEEKDAY_SHORT[parsed.getDay()]}
          </span>
          <span className="block text-base font-semibold leading-tight tabular-nums text-ink">
            {formatDayNumber(event.event_date)}
          </span>
          <span className="block text-2xs text-faint">
            {parsed.toLocaleDateString('en-IN', { month: 'short' })}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                'truncate text-sm font-semibold text-ink',
                event.status === 'cancelled' && 'line-through'
              )}
            >
              {event.title}
            </span>
            {event.important && (
              <Pill className="border-transparent bg-accent text-accent-ink">Important</Pill>
            )}
            {isDeadline && (
              <Pill className="border-transparent bg-src-deadline-wash text-src-deadline-text">
                Deadline
              </Pill>
            )}
            {event.is_public === false && (
              <Pill className="border-hairline bg-raised text-muted">Internal</Pill>
            )}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="tabular-nums">
              {isDeadline && event.start_time
                ? formatTime(event.start_time)
                : formatTimeRange(event.start_time, event.end_time, event.all_day)}
            </span>
            <Dot />
            <span className="truncate">{event.organizer_name}</span>
            {event.location && (
              <>
                <Dot />
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
                  <span className="truncate">{event.location}</span>
                </span>
              </>
            )}
          </span>
        </span>

        <span className="hidden shrink-0 items-center gap-2 lg:flex">
          {event.readiness && <ReadinessInline readiness={event.readiness} />}
          <Pill className={eventPill(event)}>{EVENT_TYPE_LABELS[event.event_type]}</Pill>
          <Pill className={STATUS_PILL[event.status]}>{STATUS_LABELS[event.status]}</Pill>
        </span>

        <ArrowRightIcon className="h-4 w-4 shrink-0 text-faint opacity-0 transition group-hover/row:opacity-100" />
      </Link>

      {isAdmin && (
        <Link
          to={`/admin/events/${event.id}/edit`}
          title={`Edit ${event.title}`}
          className="absolute right-11 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-hairline bg-surface px-2 py-1 text-xs font-medium text-muted opacity-0 shadow-card transition hover:text-ink focus-visible:opacity-100 group-hover/row:opacity-100 lg:group-hover/row:flex"
        >
          <EditIcon className="h-3.5 w-3.5" />
          Edit
        </Link>
      )}
    </li>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-faint">
      &middot;
    </span>
  );
}
