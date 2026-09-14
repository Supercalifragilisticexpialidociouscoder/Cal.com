import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api, query as buildQuery } from '../../api/client';
import { invalidate, useQuery } from '../../api/useQuery';
import type { ResponsibilityStatus, TaskWithEvent } from '../../api/types';
import { EmptyState, ErrorNotice, SectionHeading, SkeletonRows, StatusCheckbox } from '../../components/ui';
import { cn } from '../../lib/cn';
import { formatDueAt, formatRelativeDay, isPastDue, todayISO } from '../../lib/date';
import { useToast } from '../../state/ToastContext';

/** My Tasks (spec 26): a short personal list, grouped by when it is due. */
export function TasksPage() {
  const today = todayISO();
  const { notify } = useToast();
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const path = `/tasks/mine${buildQuery({ include_completed: includeCompleted })}`;
  const { data, error, loading, reload } = useQuery<{ tasks: TaskWithEvent[] }>(path, {
    staleMs: 5_000,
  });

  const tasks = data?.tasks ?? [];

  const overdue = tasks.filter(
    (task) => task.status !== 'completed' && isPastDue(task.due_at, today)
  );
  const dueToday = tasks.filter(
    (task) =>
      task.status !== 'completed' &&
      !isPastDue(task.due_at, today) &&
      (task.due_at?.slice(0, 10) === today || task.event.event_date === today)
  );
  const later = tasks.filter(
    (task) =>
      task.status !== 'completed' && !overdue.includes(task) && !dueToday.includes(task)
  );
  const done = tasks.filter((task) => task.status === 'completed');

  const cycle = async (task: TaskWithEvent) => {
    const next: ResponsibilityStatus =
      task.status === 'not_started'
        ? 'in_progress'
        : task.status === 'in_progress'
          ? 'completed'
          : 'not_started';

    setPendingId(task.id);
    try {
      await api(`/responsibilities/${task.id}`, { method: 'PATCH', body: { status: next } });
      invalidate('/tasks');
      invalidate('/overview');
      invalidate('/events');
      reload();
      if (next === 'completed') notify(`"${task.title}" marked complete.`);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not update that task.', 'error');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">My tasks</h1>
          <p className="mt-1 text-sm text-muted">
            Responsibilities assigned to you. Team-owned work lives on each event.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(changeEvent) => setIncludeCompleted(changeEvent.target.checked)}
            className="h-4 w-4 rounded border-edge text-ink focus:ring-ink/20"
          />
          Show completed
        </label>
      </header>

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <SkeletonRows rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState
          title="You're all caught up."
          body="Nothing is assigned to you right now. Responsibilities assigned to your account will appear here."
          action={
            <Link to="/events" className="btn btn-sm btn-outline">
              Browse events
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <Group title="Overdue" tasks={overdue} onCycle={cycle} pendingId={pendingId} tone="overdue" />
          <Group title="Today" tasks={dueToday} onCycle={cycle} pendingId={pendingId} />
          <Group title="Upcoming" tasks={later} onCycle={cycle} pendingId={pendingId} />
          {includeCompleted && (
            <Group title="Completed" tasks={done} onCycle={cycle} pendingId={pendingId} />
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  tasks,
  onCycle,
  pendingId,
  tone,
}: {
  title: string;
  tasks: TaskWithEvent[];
  onCycle: (task: TaskWithEvent) => void;
  pendingId: number | null;
  tone?: 'overdue';
}) {
  if (tasks.length === 0) return null;

  return (
    <section>
      <SectionHeading title={title} count={tasks.length} />
      <ul className="card divide-y divide-hairline">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={cn(
              'flex items-start gap-3 px-3.5 py-3 transition-opacity',
              pendingId === task.id && 'opacity-60'
            )}
          >
            <StatusCheckbox
              status={task.status}
              label={task.title}
              onClick={() => onCycle(task)}
              disabled={pendingId === task.id}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-sm font-medium',
                  task.status === 'completed' ? 'text-muted line-through' : 'text-ink'
                )}
              >
                {task.title}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                <Link to={`/events/${task.event.id}`} className="hover:text-accent hover:underline">
                  {task.event.title}
                </Link>
                {' · '}
                {formatRelativeDay(task.event.event_date)}
                {task.due_at && (
                  <>
                    {' · '}
                    <span
                      className={cn(
                        tone === 'overdue' && 'font-medium text-error-text'
                      )}
                    >
                      Due {formatDueAt(task.due_at)}
                    </span>
                  </>
                )}
              </p>
              {task.note && (
                <p className="mt-1.5 rounded-lg border-l-2 border-hairline bg-raised/60 px-2.5 py-1.5 text-xs text-muted">
                  {task.note}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
