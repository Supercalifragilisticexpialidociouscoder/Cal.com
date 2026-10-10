import { Link } from 'react-router-dom';
import type { ActivityEntry, OverviewResponse, TaskWithEvent } from '../../api/types';
import { useQuery } from '../../api/useQuery';
import { peekProps, useEventPeek } from '../../components/EventPeek';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  ListIcon,
  PlusIcon,
  SettingsIcon,
} from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { ReadinessBar } from '../../components/ReadinessBar';
import {
  EmptyState,
  ErrorNotice,
  SectionHeading,
  SkeletonRows,
  StatusCheckbox,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { formatRelativeDay, formatTimestamp, todayISO } from '../../lib/date';
import { READINESS_DOT, describeActivity } from '../../lib/taxonomy';
import { useAuth } from '../../state/AuthContext';
import { useTaskToggle } from '../../state/useTaskToggle';

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
  const { toggle } = useTaskToggle();
  const openEvent = useEventPeek();

  const admin = data?.admin;

  return (
    <div className="space-y-7">
      <PageHeader
        className="mb-0"
        title={viewer?.name ? `Good to see you, ${viewer.name.split(' ')[0]}` : 'Admin overview'}
        description={
          <>
            {isSuperAdmin ? 'Super Admin' : 'Staff Admin'} &middot; press{' '}
            <kbd className="rounded border border-hairline bg-raised px-1 py-px font-sans text-2xs">
              C
            </kbd>{' '}
            to create an event, or{' '}
            <kbd className="rounded border border-hairline bg-raised px-1 py-px font-sans text-2xs">
              &#8984;K
            </kbd>{' '}
            to jump anywhere.
          </>
        }
        actions={
          <>
            <Link to="/admin/manage" className="btn btn-md btn-outline">
              <SettingsIcon className="h-4 w-4" />
              Manage
            </Link>
            <Link to="/admin/events/new" className="btn btn-md btn-primary">
              <PlusIcon className="h-4 w-4" />
              New event
            </Link>
          </>
        }
      />

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <SkeletonRows rows={4} />
      ) : (
        admin && (
          <>
            <section aria-label="Today">
              <SectionHeading title="Today" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile
                  icon={CalendarIcon}
                  label="Events today"
                  value={admin.stats.events_today}
                  to="/calendar?view=day"
                />
                <Tile
                  icon={CheckCircleIcon}
                  label="My open tasks"
                  value={admin.stats.my_open_tasks}
                  to="/admin/tasks"
                />
                <Tile
                  icon={ListIcon}
                  label="Pending today"
                  value={admin.stats.pending_responsibilities_today}
                />
                <Tile
                  icon={ClockIcon}
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
                  <EmptyState icon={CheckCircleIcon} title="You're all caught up." compact />
                ) : (
                  <ul className="card divide-y divide-hairline">
                    {admin.my_tasks.map((task) => (
                      <TaskLine
                        key={task.id}
                        task={task}
                        today={today}
                        onToggle={() =>
                          void toggle(task.id, task.status, {
                            eventId: task.event.id,
                            title: task.title,
                            onSettled: reload,
                          })
                        }
                        onOpenEvent={openEvent ? () => openEvent(task.event.id) : undefined}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Event readiness">
                <SectionHeading title="Event readiness" />
                {admin.readiness.length === 0 ? (
                  <EmptyState
                    icon={ListIcon}
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
                          {...peekProps(openEvent, entry.event_id)}
                          className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-raised"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              'h-2 w-2 shrink-0 rounded-full',
                              READINESS_DOT[entry.readiness.label]
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {entry.title}
                            </span>
                            <span className="text-xs text-muted">
                              {formatRelativeDay(entry.event_date, today)} &middot;{' '}
                              {entry.readiness.completed}/{entry.readiness.total} tasks completed
                            </span>
                          </span>
                          {/* The row already states the count in words, so the
                              bar is dropped rather than crushed on a phone. */}
                          <span className="hidden w-24 shrink-0 sm:block sm:w-32">
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
                <EmptyState icon={CalendarIcon} title="Nothing scheduled yet." compact />
              ) : (
                <div className="card divide-y divide-hairline">
                  {data.upcoming_events.slice(0, 6).map((event) => (
                    <Link
                      key={event.id}
                      to={`/events/${event.id}`}
                      {...peekProps(openEvent, event.id)}
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

function Tile({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: typeof CalendarIcon;
  label: string;
  value: number;
  to?: string;
}) {
  const inner = (
    <>
      <span className="flex items-center justify-between">
        <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
        <Icon className="h-4 w-4 text-faint" />
      </span>
      <span className="mt-0.5 block text-xs font-medium text-muted">{label}</span>
    </>
  );

  return to ? (
    <Link
      to={to}
      className="rounded-xl border border-hairline bg-surface px-3.5 py-3 shadow-card transition-all hover:border-edge hover:shadow-raised"
    >
      {inner}
    </Link>
  ) : (
    <div className="rounded-xl border border-hairline bg-surface px-3.5 py-3 shadow-card">{inner}</div>
  );
}

/**
 * A task you can finish without leaving the page.
 *
 * The checkbox is never disabled while the change is in flight: it already
 * shows the new state, and someone clearing a list wants to click twice in a
 * row without waiting for the first request to come back.
 */
function TaskLine({
  task,
  today,
  onToggle,
  onOpenEvent,
}: {
  task: TaskWithEvent;
  today: string;
  onToggle: () => void;
  onOpenEvent?: () => void;
}) {
  return (
    <li className="flex items-start gap-2.5 px-3.5 py-2.5">
      <StatusCheckbox status={task.status} label={task.title} onClick={onToggle} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm font-medium',
            task.status === 'completed' ? 'text-muted line-through' : 'text-ink'
          )}
        >
          {task.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {onOpenEvent ? (
            <button type="button" onClick={onOpenEvent} className="hover:text-accent hover:underline">
              {task.event.title}
            </button>
          ) : (
            <Link to={`/events/${task.event.id}`} className="hover:text-accent hover:underline">
              {task.event.title}
            </Link>
          )}
          {' · '}
          {formatRelativeDay(task.event.event_date, today)}
        </p>
      </div>
    </li>
  );
}
