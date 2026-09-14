import { Link } from 'react-router-dom';
import type { ActivityEntry, OverviewResponse } from '../../api/types';
import { useQuery } from '../../api/useQuery';
import { ReadinessBar } from '../../components/ReadinessBar';
import { EmptyState, ErrorNotice, SectionHeading, SkeletonRows } from '../../components/ui';
import { formatRelativeDay, formatTimestamp, todayISO } from '../../lib/date';
import { READINESS_DOT, describeActivity } from '../../lib/taxonomy';
import { useAuth } from '../../state/AuthContext';

/**
 * The administrator's home (spec 27): what is happening today, what is mine,
 * and which events still need work.
 */
export function AdminOverviewPage() {
  const { viewer, isSuperAdmin } = useAuth();
  const today = todayISO();

  const { data, error, loading, reload } = useQuery<OverviewResponse>('/overview', { staleMs: 10_000 });
  const { data: activityData } = useQuery<{ activity: ActivityEntry[] }>('/admin/activity', {
    staleMs: 20_000,
  });

  const admin = data?.admin;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Admin overview</h1>
          <p className="mt-1 text-sm text-muted">
            Signed in as {viewer?.name} &middot;{' '}
            <span className="font-medium text-accent">
              {isSuperAdmin ? 'Super Admin' : 'Staff Admin'}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/events/new" className="btn btn-md btn-primary">
            + Create Event
          </Link>
          <Link to="/admin/manage" className="btn btn-md btn-outline">
            Manage
          </Link>
        </div>
      </header>

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <SkeletonRows rows={4} />
      ) : (
        admin && (
          <>
            <section aria-label="Today">
              <SectionHeading title="Today" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Events" value={admin.stats.events_today} to="/calendar?view=day" />
                <Tile label="My tasks" value={admin.stats.my_open_tasks} to="/admin/tasks" />
                <Tile
                  label="Pending responsibilities"
                  value={admin.stats.pending_responsibilities_today}
                />
                <Tile
                  label="Deadlines in 14 days"
                  value={admin.stats.deadlines_next_14_days}
                  to="/events?event_type=deadline"
                />
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section aria-label="My tasks">
                <SectionHeading
                  title="My tasks"
                  count={admin.my_tasks.length}
                  action={
                    <Link to="/admin/tasks" className="text-xs font-medium text-accent hover:underline">
                      Open
                    </Link>
                  }
                />
                {admin.my_tasks.length === 0 ? (
                  <EmptyState title="You're all caught up." compact />
                ) : (
                  <div className="card divide-y divide-hairline">
                    {admin.my_tasks.map((task) => (
                      <Link
                        key={task.id}
                        to={`/events/${task.event.id}`}
                        className="block px-3.5 py-2.5 transition-colors hover:bg-raised"
                      >
                        <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {task.event.title} &middot;{' '}
                          {formatRelativeDay(task.event.event_date, today)}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              <section aria-label="Event readiness">
                <SectionHeading title="Event readiness" />
                {admin.readiness.length === 0 ? (
                  <EmptyState
                    title="No events with checklists yet."
                    body="Add responsibilities to an event to track how ready it is."
                    compact
                  />
                ) : (
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
                            <span className="block truncate text-sm font-medium text-ink">
                              {entry.title}
                            </span>
                            <span className="text-xs text-muted">
                              {formatRelativeDay(entry.event_date, today)} &middot;{' '}
                              {entry.readiness.completed}/{entry.readiness.total} tasks completed
                            </span>
                          </span>
                          <span className="w-24 shrink-0 sm:w-32">
                            <ReadinessBar readiness={entry.readiness} size="sm" showLabel={false} />
                          </span>
                        </Link>
                      ) : null
                    )}
                  </div>
                )}
              </section>
            </div>

            <section aria-label="Upcoming events">
              <SectionHeading
                title="Upcoming"
                action={
                  <Link to="/events" className="text-xs font-medium text-accent hover:underline">
                    All events
                  </Link>
                }
              />
              {data.upcoming_events.length === 0 ? (
                <EmptyState title="Nothing scheduled yet." compact />
              ) : (
                <div className="card divide-y divide-hairline">
                  {data.upcoming_events.slice(0, 6).map((event) => (
                    <Link
                      key={event.id}
                      to={`/events/${event.id}`}
                      className="flex flex-wrap items-baseline gap-x-3 px-3.5 py-2.5 transition-colors hover:bg-raised"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                        {event.title}
                      </span>
                      <span className="text-xs text-muted">{event.organizer_name}</span>
                      <span className="text-xs tabular-nums text-faint">
                        {formatRelativeDay(event.event_date, today)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {activityData && activityData.activity.length > 0 && (
              <section aria-label="Recent activity">
                <SectionHeading title="Recent activity" />
                <ol className="card divide-y divide-hairline">
                  {activityData.activity.slice(0, 12).map((entry) => (
                    <li key={entry.id} className="px-3.5 py-2.5">
                      <p className="text-sm text-ink">
                        {describeActivity(
                          entry.action,
                          entry.metadata,
                          entry.user_name,
                          entry.user_id === viewer?.id
                        )}
                      </p>
                      <p className="mt-0.5 text-2xs text-faint">
                        {entry.event_title ? `${entry.event_title} · ` : ''}
                        {formatTimestamp(entry.created_at)}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}

function Tile({ label, value, to }: { label: string; value: number; to?: string }) {
  const inner = (
    <>
      <span className="block text-2xl font-semibold tabular-nums text-ink">{value}</span>
      <span className="mt-0.5 block text-xs font-medium text-muted">{label}</span>
    </>
  );

  return to ? (
    <Link
      to={to}
      className="rounded-xl border border-hairline bg-surface px-3.5 py-3 shadow-card transition-colors hover:border-edge hover:bg-raised/50"
    >
      {inner}
    </Link>
  ) : (
    <div className="rounded-xl border border-hairline bg-surface px-3.5 py-3 shadow-card">{inner}</div>
  );
}
