import { Link, Navigate } from 'react-router-dom';
import type { CalendarEvent, OverviewResponse } from '../api/types';
import { useQuery } from '../api/useQuery';
import { EventCard, EventRow } from '../components/EventCard';
import { peekProps, useEventPeek } from '../components/EventPeek';
import { CalendarIcon, ClockIcon, SparkIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import {
  EmptyState,
  ErrorNotice,
  Pill,
  SectionHeading,
  SkeletonRows,
} from '../components/ui';
import {
  formatDistanceInDays,
  formatFullDate,
  formatLongDate,
  formatTime,
  todayISO,
} from '../lib/date';
import { useAuth } from '../state/AuthContext';

/**
 * The public landing page. Somebody arriving with the link should understand
 * what is happening at MRTC before scrolling (spec 4, 51).
 *
 * Administrators have their own home at /admin, which answers a different
 * question - what still needs doing - so they are sent there instead of being
 * shown a version of this page with extra panels bolted on.
 */
export function OverviewPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const { data, error, loading, reload } = useQuery<OverviewResponse>('/overview', {
    staleMs: 30_000,
  });
  const openEvent = useEventPeek();

  const today = data?.today ?? todayISO();

  if (!authLoading && isAdmin) return <Navigate to="/admin" replace />;

  return (
    <div className="space-y-8">
      <PageHeader
        className="mb-0"
        title="What's on at MRTC"
        description="Events, activities, deadlines and the academic schedule - open to everyone, no sign-in needed."
        actions={
          <Link to="/calendar" className="btn btn-md btn-outline">
            <CalendarIcon className="h-4 w-4" />
            Open calendar
          </Link>
        }
      />

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {/* TODAY --------------------------------------------------------------- */}
      <section aria-labelledby="today-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="today-heading" className="section-title">
              Today
            </h2>
            <p className="mt-1 text-base font-semibold text-ink">{formatFullDate(today)}</p>
          </div>
          {data && (
            <p className="text-sm text-muted">
              {data.today_events.length === 0
                ? 'No events'
                : `${data.today_events.length} ${data.today_events.length === 1 ? 'event' : 'events'}`}
            </p>
          )}
        </div>

        {loading && !data ? (
          <SkeletonRows rows={3} />
        ) : data && data.today_events.length > 0 ? (
          <div className="card divide-y divide-hairline p-1.5">
            {data.today_events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarIcon}
            title="Nothing is scheduled for today."
            body="Check what is coming up over the next few weeks."
            action={
              <Link to="/upcoming" className="btn btn-sm btn-primary">
                View upcoming
              </Link>
            }
          />
        )}
      </section>

      {/* IMPORTANT DEADLINES ------------------------------------------------ */}
      {data && data.deadlines.length > 0 && (
        <section aria-labelledby="deadlines-heading">
          <SectionHeading
            title="Important deadlines"
            count={data.deadlines.length}
            action={
              <Link
                to="/events?event_type=deadline"
                className="text-xs font-medium text-accent hover:underline"
              >
                See all
              </Link>
            }
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {data.deadlines.map((deadline) => (
              <DeadlineCard
                key={deadline.id}
                deadline={deadline}
                today={today}
                peek={peekProps(openEvent, deadline.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* HIGHLIGHTS --------------------------------------------------------- */}
      {data && data.important_events.length > 0 && (
        <section aria-labelledby="important-heading">
          <SectionHeading
            title="Worth knowing about"
            count={data.important_events.length}
            action={
              <Link to="/events?important=true" className="text-xs font-medium text-accent hover:underline">
                See all
              </Link>
            }
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {data.important_events.slice(0, 4).map((event) => (
              <EventCard key={event.id} event={event} dateStyle="absolute" />
            ))}
          </div>
        </section>
      )}

      {/* UPCOMING ----------------------------------------------------------- */}
      <section aria-labelledby="upcoming-heading">
        <SectionHeading
          title="Upcoming events"
          action={
            <Link to="/upcoming" className="text-xs font-medium text-accent hover:underline">
              See all
            </Link>
          }
        />
        {loading && !data ? (
          <SkeletonRows rows={4} />
        ) : data && data.upcoming_events.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.upcoming_events.map((event) => (
              <EventCard key={event.id} event={event} dateStyle="absolute" />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={SparkIcon}
            title="No upcoming events yet."
            body="Nothing is scheduled over the coming weeks."
          />
        )}
      </section>

      <p className="pt-2 text-center text-xs text-muted">
        Looking for the calendar on your phone? Bookmark this page &mdash; no sign-in needed.
      </p>
    </div>
  );
}

function DeadlineCard({
  deadline,
  today,
  peek,
}: {
  deadline: CalendarEvent;
  today: string;
  peek: { onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void };
}) {
  return (
    <Link
      to={`/events/${deadline.id}`}
      {...peek}
      className="group flex items-start gap-3 rounded-xl border border-hairline bg-surface p-3.5 shadow-card transition-all hover:border-edge hover:shadow-raised"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-src-deadline-wash text-src-deadline"
      >
        <ClockIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xs font-semibold uppercase tracking-wider text-src-deadline-text">
          {deadline.organizer_name}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-ink group-hover:text-accent">
          {deadline.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          {formatLongDate(deadline.event_date)}
          {deadline.start_time ? ` · ${formatTime(deadline.start_time)}` : ''}
          <span className="text-faint"> · {formatDistanceInDays(deadline.event_date, today)}</span>
        </span>
      </span>
    </Link>
  );
}

export function ImportantBadge() {
  return <Pill className="border-transparent bg-accent text-accent-ink">Important</Pill>;
}
