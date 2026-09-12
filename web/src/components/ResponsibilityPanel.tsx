import { useState } from 'react';
import { ApiError, api } from '../api/client';
import { invalidate } from '../api/useQuery';
import type { AssigneesResponse, Conflict, Responsibility, ResponsibilityStatus } from '../api/types';
import { cn } from '../lib/cn';
import { formatDueAt, formatTimestamp, isPastDue } from '../lib/date';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { ConflictWarning } from './ConflictWarning';
import { ConfirmDialog } from './Modal';
import { EmptyState, FieldError, Pill, StatusCheckbox } from './ui';

/**
 * The event checklist (spec 8-11, 30). Intentionally small: a checkbox, who
 * owns it, an optional due time and a note that keeps the context attached.
 */
export function ResponsibilityPanel({
  eventId,
  responsibilities,
  publicCount,
  totalCount,
  assignees,
  onChanged,
}: {
  eventId: number;
  responsibilities: Responsibility[];
  /** How many responsibilities are published. */
  publicCount: number;
  /** How many exist in total - which is more than a public viewer receives. */
  totalCount: number;
  assignees?: AssigneesResponse;
  onChanged: () => void;
}) {
  const { isAdmin } = useAuth();
  const { notify } = useToast();
  const [adding, setAdding] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Responsibility | null>(null);
  const [busy, setBusy] = useState(false);

  // A public viewer only receives the published rows, so the count of hidden
  // work has to come from the event total rather than the list length.
  const hiddenFromPublic = Math.max(0, totalCount - publicCount);

  const cycleStatus = async (responsibility: Responsibility) => {
    if (!isAdmin) return;
    const next: ResponsibilityStatus =
      responsibility.status === 'not_started'
        ? 'in_progress'
        : responsibility.status === 'in_progress'
          ? 'completed'
          : 'not_started';

    setPendingId(responsibility.id);
    try {
      await api(`/responsibilities/${responsibility.id}`, {
        method: 'PATCH',
        body: { status: next },
      });
      invalidate('/events');
      invalidate('/overview');
      invalidate('/tasks');
      onChanged();
      if (next === 'completed') notify(`"${responsibility.title}" marked complete.`);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'We could not update that task.', 'error');
    } finally {
      setPendingId(null);
    }
  };

  const toggleVisibility = async (responsibility: Responsibility) => {
    setPendingId(responsibility.id);
    try {
      await api(`/responsibilities/${responsibility.id}`, {
        method: 'PATCH',
        body: { public_visibility: !responsibility.public_visibility },
      });
      invalidate('/events');
      onChanged();
      notify(
        responsibility.public_visibility
          ? 'That responsibility is now internal only.'
          : 'That responsibility is now visible to everyone.'
      );
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'We could not update that task.', 'error');
    } finally {
      setPendingId(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/responsibilities/${removing.id}`, { method: 'DELETE' });
      invalidate('/events');
      invalidate('/overview');
      invalidate('/tasks');
      setRemoving(null);
      onChanged();
      notify('Responsibility removed.');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'We could not remove that task.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="responsibilities-heading" className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="responsibilities-heading" className="text-sm font-semibold text-ink">
          {isAdmin ? 'Event responsibilities' : 'What is being organised'}
        </h2>
        {isAdmin && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn btn-sm btn-outline">
            + Add Responsibility
          </button>
        )}
      </div>

      {!isAdmin && publicCount > 0 && hiddenFromPublic > 0 && (
        <p className="mb-3 text-xs text-muted">
          Showing the {publicCount} {publicCount === 1 ? 'task' : 'tasks'} the organisers have shared
          publicly. The readiness figure counts all {totalCount}, including internal preparation.
        </p>
      )}

      {adding && isAdmin && (
        <div className="mb-4">
          <AddResponsibilityForm
            eventId={eventId}
            assignees={assignees}
            onDone={() => {
              setAdding(false);
              onChanged();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {responsibilities.length === 0 ? (
        <EmptyState
          title={isAdmin ? 'No responsibilities yet.' : 'Nothing published yet.'}
          body={
            isAdmin
              ? 'Add the tasks this event needs and assign them to a team or a person.'
              : 'The organisers have not shared a task list for this event.'
          }
          action={
            isAdmin && !adding ? (
              <button type="button" onClick={() => setAdding(true)} className="btn btn-sm btn-primary">
                + Add Responsibility
              </button>
            ) : undefined
          }
          compact
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {responsibilities.map((responsibility) => (
            <li
              key={responsibility.id}
              className={cn(
                'flex items-start gap-3 py-2.5 transition-opacity',
                pendingId === responsibility.id && 'opacity-60'
              )}
            >
              <StatusCheckbox
                status={responsibility.status}
                label={responsibility.title}
                onClick={isAdmin ? () => cycleStatus(responsibility) : undefined}
                disabled={pendingId === responsibility.id}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      responsibility.status === 'completed' ? 'text-muted line-through' : 'text-ink'
                    )}
                  >
                    {responsibility.title}
                  </span>
                  {isAdmin && (
                    <Pill
                      className={
                        responsibility.public_visibility
                          ? 'border-emerald-600/20 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200'
                          : 'border-hairline bg-raised text-muted'
                      }
                      title={
                        responsibility.public_visibility
                          ? 'Visible on the public event page'
                          : 'Internal only - students do not see this'
                      }
                    >
                      {responsibility.public_visibility ? 'Public' : 'Internal'}
                    </Pill>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-muted">
                  Assigned to <span className="font-medium text-ink/80">{responsibility.assigned_to}</span>
                  {responsibility.due_at && (
                    <>
                      {' · '}
                      <span
                        className={cn(
                          isPastDue(responsibility.due_at) && responsibility.status !== 'completed'
                            ? 'font-medium text-rose-600 dark:text-rose-400'
                            : ''
                        )}
                      >
                        Due {formatDueAt(responsibility.due_at)}
                      </span>
                    </>
                  )}
                </p>

                {/* The note lives with the task, so context is never lost (spec 9). */}
                {responsibility.note && (
                  <p className="mt-1.5 rounded-lg border-l-2 border-hairline bg-raised/60 px-2.5 py-1.5 text-xs text-muted">
                    {responsibility.note}
                  </p>
                )}

                {isAdmin && responsibility.status === 'completed' && responsibility.completed_by_name && (
                  <p className="mt-1 text-2xs text-faint">
                    Completed by {responsibility.completed_by_name}
                    {responsibility.completed_at ? ` · ${formatTimestamp(responsibility.completed_at)}` : ''}
                  </p>
                )}
              </div>

              {isAdmin && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleVisibility(responsibility)}
                    disabled={pendingId === responsibility.id}
                    className="btn btn-sm btn-ghost px-1.5 text-2xs"
                    title={
                      responsibility.public_visibility
                        ? 'Make internal only'
                        : 'Show this on the public event page'
                    }
                  >
                    {responsibility.public_visibility ? 'Hide' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(responsibility)}
                    className="btn btn-sm btn-ghost px-1.5"
                    aria-label={`Remove ${responsibility.title}`}
                    title="Remove"
                  >
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this responsibility?"
        message={`"${removing?.title ?? ''}" will be removed from this event's checklist.`}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

/** Fast by design: only the task name is required (spec 10). */
function AddResponsibilityForm({
  eventId,
  assignees,
  onDone,
  onCancel,
}: {
  eventId: number;
  assignees?: AssigneesResponse;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { notify } = useToast();
  const [title, setTitle] = useState('');
  const [assignedTeam, setAssignedTeam] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<{ message: string; conflicts: Conflict[] } | null>(null);

  const submit = async (override = false) => {
    setSaving(true);
    setFieldErrors({});
    if (!override) setConflict(null);

    try {
      await api(`/events/${eventId}/responsibilities`, {
        method: 'POST',
        body: {
          title,
          assigned_team: assignedTeam,
          assigned_user_id: assignedUserId ? Number(assignedUserId) : null,
          note,
          due_at: dueAt ? dueAt.replace('T', ' ') : null,
          public_visibility: isPublic,
          override_conflicts: override,
        },
      });
      invalidate('/events');
      invalidate('/overview');
      invalidate('/tasks');
      notify('Responsibility added.');
      onDone();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 409 && error.canOverride) {
          setConflict({ message: error.message, conflicts: error.conflicts });
        } else if (error.status === 400) {
          setFieldErrors(error.fieldErrors);
          notify(error.message, 'error');
        } else {
          notify(error.message, 'error');
        }
      } else {
        notify('We could not add that responsibility. Please try again.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="space-y-3 rounded-xl border border-hairline bg-raised/40 p-3.5 animate-slide-up"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div>
        <label className="field-label" htmlFor="responsibility-title">
          Task
        </label>
        <input
          id="responsibility-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Photography"
          className="field"
          required
          maxLength={180}
        />
        <FieldError message={fieldErrors.title} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="responsibility-team">
            Assigned to
          </label>
          <input
            id="responsibility-team"
            value={assignedTeam}
            onChange={(event) => setAssignedTeam(event.target.value)}
            placeholder="Media Club"
            list="assignee-teams"
            className="field"
            maxLength={120}
          />
          <datalist id="assignee-teams">
            {(assignees?.teams ?? []).map((team) => (
              <option key={team} value={team} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label" htmlFor="responsibility-admin">
            Or an administrator
          </label>
          <select
            id="responsibility-admin"
            value={assignedUserId}
            onChange={(event) => setAssignedUserId(event.target.value)}
            className="field"
          >
            <option value="">Nobody in particular</option>
            {(assignees?.admins ?? []).map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.name}
                {admin.is_you ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="responsibility-due">
            Due (optional)
          </label>
          <input
            id="responsibility-due"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="field"
          />
          <FieldError message={fieldErrors.due_at} />
        </div>

        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-4 w-4 rounded border-edge text-accent focus:ring-accent/40"
            />
            Visible to the public
          </label>
        </div>
      </div>

      <div>
        <label className="field-label" htmlFor="responsibility-note">
          Note (optional)
        </label>
        <input
          id="responsibility-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Photos plus a 30 second reel."
          className="field"
          maxLength={2000}
        />
      </div>

      {conflict && (
        <ConflictWarning
          message={conflict.message}
          conflicts={conflict.conflicts}
          busy={saving}
          overrideLabel="Assign anyway"
          onOverride={() => void submit(true)}
          onCancel={() => setConflict(null)}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || title.trim().length === 0} className="btn btn-md btn-primary">
          {saving ? 'Adding...' : 'Add Responsibility'}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-md btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );
}
