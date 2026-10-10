import { useState } from 'react';
import { Link } from 'react-router-dom';
import { query as buildQuery } from '../../api/client';
import { useQuery } from '../../api/useQuery';
import type { TaskWithEvent } from '../../api/types';
import { CheckCircleIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorNotice, SectionHeading, SkeletonRows, StatusCheckbox } from '../../components/ui';
import { cn } from '../../lib/cn';
import { formatDueAt, formatRelativeDay, isPastDue, todayISO } from '../../lib/date';
import { useTaskToggle } from '../../state/useTaskToggle';

/** My Tasks (spec 26): a short personal list, grouped by when it is due. */
export function TasksPage() {
  const today = todayISO();
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const { toggle } = useTaskToggle();

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

  const cycle = (task: TaskWithEvent) =>
    toggle(task.id, task.status, {
      eventId: task.event.id,
      title: task.title,
      onSettled: reload,
    });

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="My tasks"
        description="Responsibilities assigned to you. Team-owned work lives on each event."
        actions={
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(changeEvent) => setIncludeCompleted(changeEvent.target.checked)}
              className="h-4 w-4 rounded border-edge text-ink focus:ring-ink/20"
            />
            Show completed
          </label>
        }
      />

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <SkeletonRows rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CheckCircleIcon}
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
          <Group title="Overdue" tasks={overdue} onCycle={cycle} tone="overdue" />
          <Group title="Today" tasks={dueToday} onCycle={cycle} />
          <Group title="Upcoming" tasks={later} onCycle={cycle} />
          {includeCompleted && <Group title="Completed" tasks={done} onCycle={cycle} />}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  tasks,
  onCycle,
  tone,
}: {
  title: string;
  tasks: TaskWithEvent[];
  onCycle: (task: TaskWithEvent) => void;
  tone?: 'overdue';
}) {
  if (tasks.length === 0) return null;

  return (
    <section>
      <SectionHeading title={title} count={tasks.length} />
      <ul className="card divide-y divide-hairline">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-start gap-3 px-3.5 py-3">
            <StatusCheckbox status={task.status} label={task.title} onClick={() => onCycle(task)} />
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
