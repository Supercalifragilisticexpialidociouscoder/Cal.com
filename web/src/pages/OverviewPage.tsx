import { Link } from 'react-router-dom';
import type { OverviewResponse } from '../api/types';
import { useQuery } from '../api/useQuery';
import { EventCard, EventRow } from '../components/EventCard';
import { ReadinessBar } from '../components/ReadinessBar';
import {
  EmptyState,
  ErrorNotice,
  Pill,
  SectionHeading,
  SkeletonRows,
} from '../components/ui';
import { cn } from '../lib/cn';
import {
  formatDistanceInDays,
  formatFullDate,
  formatLongDate,
  formatRelativeDay,
  formatTime,
  todayISO,
} from '../lib/date';
import { READINESS_DOT } from '../lib/taxonomy';
import { useAuth } from '../state/AuthContext';

/**
 * The landing page. A student arriving with the link should understand what is
 * happening at MRTC before scrolling (spec 4, 51).
 */
export function OverviewPage() {
  const { isAdmin, viewer } = useAuth();
  const { data, error, loading, reload } = useQuery<OverviewResponse>('/overview', {
    staleMs: 30_000,
  });

  const today = data?.today ?? todayISO();
  const admin = data?.admin;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {isAdmin ? `Good to see you, ${viewer?.name.split(' ')[0]}.` : 'MRTC Calendar'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isAdmin
              ? 'Everything happening at MRTC, and what still needs to be done.'
              : "What's happening at MRTC - events, activities, deadlines and schedule."}
          </p>
        </div>
        <Link to="/calendar" className="btn btn-md btn-outline">
          Open calendar
        </Link>
      </header>

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {isAdmin && admin && (
        <section aria-label="Today at a glance">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Events today" value={admin.stats.events_today} to="/calendar?view=day" />
            <StatTile label="My open tasks" value={admin.stats.my_open_tasks} to="/admin/tasks" />
            <StatTile
              label="Pending today"
              value={admin.stats.pending_responsibilities_today}
              hint="Responsibilities still open on today's events"
            />
            <StatTile
              label="Deadlines in 14 days"
              value={admin.stats.deadlines_next_14_days}
              to="/events?event_type=deadline"
            />
          </div>
        </section>
      )}

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
              <Link to="/events?event_type=deadline" className="text-xs font-medium text-accent hover:underline">
                See all
              </Link>
            }
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {data.deadlines.map((deadline) => (
              <Link
                key={deadline.id}
                to={`/events/${deadline.id}`}
                className="group flex items-start gap-3 rounded-xl border border-hairline bg-surface p-3.5 shadow-card transition-colors hover:border-edge"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-src-deadline-wash text-src-deadline"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4">
                    <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
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
            ))}
          </div>
        </section>
      )}

      {/* MY TASKS (admin) --------------------------------------------------- */}
      {isAdmin && admin && (
        <section aria-labelledby="my-tasks-heading">
          <SectionHeading
            title="My tasks"
            count={admin.my_tasks.length}
            action={
              <Link to="/admin/tasks" className="text-xs font-medium text-accent hover:underline">
                Open my tasks
              </Link>
            }
          />
          {admin.my_tasks.length === 0 ? (
            <EmptyState title="You're all caught up." compact />
          ) : (
            <div className="card divide-y divide-hairline">
              {admin.my_tasks.slice(0, 5).map((task) => (
                <Link
                  key={task.id}
                  to={`/events/${task.event.id}`}
                  className="flex items-start gap-3 px-3.5 py-2.5 transition-colors hover:bg-raised"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-1 h-[15px] w-[15px] shrink-0 rounded-[4px] border',
                      task.status === 'in_progress' ? 'border-attention bg-attention/20' : 'border-edge'
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{task.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {task.event.title} · {formatRelativeDay(task.event.event_date, today)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
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
            title="No upcoming events yet."
            body="Nothing is scheduled over the coming weeks."
          />
        )}
      </section>

      {/* EVENT READINESS (admin) ------------------------------------------- */}
      {isAdmin && admin && admin.readiness.length > 0 && (
        <section aria-labelledby="readiness-heading">
          <SectionHeading title="Events needing attention" />
          <div className="card divide-y divide-hairline">
            {admin.readiness.map((entry) =>
              entry.readiness ? (
                <Link
                  key={entry.event_id}
                  to={`/events/${entry.event_id}`}
                  className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-raised"
                >
                  <span aria-hidden="true" className="text-sm">
                    {READINESS_DOT[entry.readiness.label]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{entry.title}</span>
                    <span className="text-xs text-muted">
                      {formatRelativeDay(entry.event_date, today)}
                    </span>
                  </span>
                  <span className="w-32 shrink-0 sm:w-44">
                    <ReadinessBar readiness={entry.readiness} size="sm" />
                  </span>
                </Link>
              ) : null
            )}
          </div>
        </section>
      )}

      {!isAdmin && (
        <p className="pt-2 text-center text-xs text-muted">
          Looking for the calendar on your phone? Bookmark this page - no sign-in needed.
        </p>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  to,
  hint,
}: {
  label: string;
  value: number;
  to?: string;
  hint?: string;
}) {
  const content = (
    <>
      <span className="block text-2xl font-semibold tabular-nums text-ink">{value}</span>
      <span className="mt-0.5 block text-xs font-medium text-muted">{label}</span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        title={hint}
        className="rounded-xl border border-hairline bg-surface px-3.5 py-3 shadow-card transition-colors hover:border-edge hover:bg-raised/50"
      >
        {content}
      </Link>
    );
  }

  return (
    <div title={hint} className="rounded-xl border border-hairline bg-surface px-3.5 py-3 shadow-card">
      {content}
    </div>
  );
}

export function ImportantBadge() {
  return <Pill className="border-transparent bg-accent text-accent-ink">Important</Pill>;
}
