import { Link } from 'react-router-dom';
import { query as buildQuery } from '../api/client';
import type { EventListResponse } from '../api/types';
import { useQuery } from '../api/useQuery';
import { AgendaView } from '../components/calendar/AgendaView';
import { ErrorNotice, SectionHeading, SkeletonRows } from '../components/ui';
import { addDays, formatLongDate, formatDistanceInDays, formatTime, todayISO } from '../lib/date';

/** A plain chronological answer to "what is coming up?" (spec 4). */
export function UpcomingPage() {
  const today = todayISO();
  const horizon = addDays(today, 120);

  const path = `/events${buildQuery({ from: today, to: horizon, limit: 200 })}`;
  const { data, error, loading, reload } = useQuery<EventListResponse>(path, { staleMs: 30_000 });

  const events = data?.events ?? [];
  const deadlines = events.filter((event) => event.event_type === 'deadline');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Upcoming</h1>
        <p className="mt-1 text-sm text-muted">
          Everything scheduled from today through {formatLongDate(horizon)}.
        </p>
      </header>

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {deadlines.length > 0 && (
        <section aria-labelledby="upcoming-deadlines">
          <SectionHeading title="Deadlines" count={deadlines.length} />
          <div className="card divide-y divide-hairline">
            {deadlines.map((deadline) => (
              <Link
                key={deadline.id}
                to={`/events/${deadline.id}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3.5 py-3 transition-colors hover:bg-raised"
              >
                <span className="w-full text-2xs font-semibold uppercase tracking-wider text-attention-text sm:w-auto">
                  {deadline.organizer_name}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {deadline.title}
                </span>
                <span className="text-xs tabular-nums text-muted">
                  {formatLongDate(deadline.event_date)}
                  {deadline.start_time ? ` · ${formatTime(deadline.start_time)}` : ''}
                </span>
                <span className="text-xs text-faint">{formatDistanceInDays(deadline.event_date, today)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="upcoming-all">
        <SectionHeading title="All upcoming" count={events.length} />
        {loading && !data ? (
          <SkeletonRows rows={6} />
        ) : (
          <AgendaView
            events={events}
            today={today}
            emptyTitle="Nothing is scheduled yet."
            emptyBody="When events are added to the MRTC calendar, they will show up here."
            emptyAction={
              <Link to="/calendar" className="btn btn-sm btn-outline">
                Open calendar
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
