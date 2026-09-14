import { Link } from 'react-router-dom';
import type { CalendarEvent } from '../api/types';
import { cn } from '../lib/cn';
import { formatMediumDate, formatRelativeDay, formatTimeRange, formatTime } from '../lib/date';
import {
  EVENT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_PILL,
  eventAccent,
  eventPill,
} from '../lib/taxonomy';
import { ReadinessInline } from './ReadinessBar';
import { Pill } from './ui';

/**
 * The event card answers "what, when, where, who, is it ready" at a glance,
 * so most events never need to be opened (spec 43).
 */
export function EventCard({
  event,
  showDate = true,
  dateStyle = 'relative',
  className,
}: {
  event: CalendarEvent;
  showDate?: boolean;
  dateStyle?: 'relative' | 'absolute';
  className?: string;
}) {
  const isDeadline = event.event_type === 'deadline';

  return (
    <Link
      to={`/events/${event.id}`}
      className={cn(
        'group relative flex gap-3 overflow-hidden rounded-xl border bg-surface p-3.5 shadow-card transition-all',
        'hover:border-edge hover:shadow-raised focus-visible:border-accent',
        event.important ? 'border-l-[3px] border-hairline border-l-accent' : 'border-hairline',
        event.status === 'cancelled' && 'opacity-70',
        className
      )}
    >
      {/* Source colour rail: where the event comes from, at a glance. */}
      {!event.important && (
        <span
          aria-hidden="true"
          className={cn('absolute inset-y-0 left-0 w-[3px]', eventAccent(event))}
        />
      )}

      <div className="min-w-0 flex-1 pl-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {isDeadline && (
            <Pill className="border-transparent bg-src-deadline-wash text-src-deadline-text">
              Deadline
            </Pill>
          )}
          {event.important && (
            <Pill className="border-transparent bg-accent text-accent-ink" title="Marked important">
              Important
            </Pill>
          )}
          <Pill className={eventPill(event)}>{event.organizer_name}</Pill>
        </div>

        <h3 className="mt-1.5 truncate text-[0.9375rem] font-semibold leading-snug text-ink group-hover:text-accent">
          {event.title}
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {showDate && (
            <span className="font-medium text-ink/80">
              {dateStyle === 'relative'
                ? formatRelativeDay(event.event_date)
                : formatMediumDate(event.event_date)}
            </span>
          )}
          {showDate && <Separator />}
          <span>
            {isDeadline && event.start_time
              ? formatTime(event.start_time)
              : formatTimeRange(event.start_time, event.end_time, event.all_day)}
          </span>
          {event.location && (
            <>
              <Separator />
              <span className="truncate">{event.location}</span>
            </>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Pill className={STATUS_PILL[event.status]}>{STATUS_LABELS[event.status]}</Pill>
          <Pill className="border-hairline bg-raised text-muted">
            {EVENT_TYPE_LABELS[event.event_type]}
          </Pill>
          {event.readiness && <ReadinessInline readiness={event.readiness} />}
          {event.is_public === false && (
            <Pill className="border-hairline bg-raised text-muted" title="Not shown on the public calendar">
              Internal
            </Pill>
          )}
        </div>
      </div>
    </Link>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="text-faint">
      &middot;
    </span>
  );
}

/** The compact row used in the Today and Upcoming lists on the home page. */
export function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <Link
      to={`/events/${event.id}`}
      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-raised"
    >
      <span className="w-[4.75rem] shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted">
        {event.all_day ? 'All day' : event.start_time ? formatTime(event.start_time) : '--'}
      </span>
      <span
        aria-hidden="true"
        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', eventAccent(event))}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink group-hover:text-accent">
            {event.title}
          </span>
          {event.important && (
            <Pill className="border-transparent bg-accent text-accent-ink">Important</Pill>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          <span className="truncate">{event.organizer_name}</span>
          {event.location && (
            <>
              <Separator />
              <span className="truncate">{event.location}</span>
            </>
          )}
        </span>
      </span>
    </Link>
  );
}
