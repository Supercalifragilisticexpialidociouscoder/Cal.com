import { useEffect, useState } from 'react';
import { ApiError, api, query as buildQuery } from '../../api/client';
import { invalidate, useQuery } from '../../api/useQuery';
import type { AssigneesResponse, EventListResponse, QuickNote } from '../../api/types';
import { ConfirmDialog, Modal } from '../../components/Modal';
import { EmptyState, ErrorNotice, FieldError, Pill, SectionHeading, SkeletonRows } from '../../components/ui';
import { cn } from '../../lib/cn';
import { formatMediumDate, formatTimestamp, todayISO } from '../../lib/date';
import { useToast } from '../../state/ToastContext';

/**
 * Quick Notes (spec 13-16). Private to their author, and fast above all: type
 * something, press save, done. No category, no deadline, no assignment.
 */
export function NotesPage() {
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<QuickNote | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', content: '' });
  const [removing, setRemoving] = useState<QuickNote | null>(null);
  const [converting, setConverting] = useState<QuickNote | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  const path = `/notes${buildQuery({ q: debounced, archived: showArchived })}`;
  const { data, error, loading, reload } = useQuery<{ notes: QuickNote[] }>(path, { staleMs: 5_000 });

  const notes = data?.notes ?? [];
  const pinned = notes.filter((note) => note.pinned);
  const rest = notes.filter((note) => !note.pinned);

  const create = async () => {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    try {
      await api('/notes', { method: 'POST', body: { content } });
      setDraft('');
      invalidate('/notes');
      reload();
      notify('Note saved.');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not save that note.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (note: QuickNote, body: Record<string, unknown>, message?: string) => {
    try {
      await api(`/notes/${note.id}`, { method: 'PATCH', body });
      invalidate('/notes');
      reload();
      if (message) notify(message);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not update that note.', 'error');
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api(`/notes/${editing.id}`, {
        method: 'PATCH',
        body: { title: editDraft.title, content: editDraft.content },
      });
      invalidate('/notes');
      setEditing(null);
      reload();
      notify('Note updated.');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not update that note.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/notes/${removing.id}`, { method: 'DELETE' });
      invalidate('/notes');
      setRemoving(null);
      reload();
      notify('Note deleted.');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not delete that note.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Quick notes</h1>
        <p className="mt-1 text-sm text-muted">
          Private to your account. No other administrator can see these &mdash; not even the Super Admin.
        </p>
      </header>

      {/* Capture first: the fastest path is typing and pressing save. */}
      <form
        className="card p-3.5"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          void create();
        }}
      >
        <label className="sr-only" htmlFor="new-note">
          New note
        </label>
        <textarea
          id="new-note"
          value={draft}
          onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          onKeyDown={(keyEvent) => {
            if ((keyEvent.metaKey || keyEvent.ctrlKey) && keyEvent.key === 'Enter') {
              keyEvent.preventDefault();
              void create();
            }
          }}
          rows={2}
          placeholder="Need Media photos from the 11 September event."
          className="field resize-y"
          maxLength={8000}
        />
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-2xs text-faint">Ctrl/⌘ + Enter to save</p>
          <button
            type="submit"
            disabled={saving || draft.trim().length === 0}
            className="btn btn-md btn-primary"
          >
            {saving ? 'Saving...' : 'Save note'}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <input
            type="search"
            value={search}
            onChange={(changeEvent) => setSearch(changeEvent.target.value)}
            placeholder="Search your notes"
            className="field"
            aria-label="Search notes"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          aria-pressed={showArchived}
          className={cn('btn btn-sm', showArchived ? 'btn-primary' : 'btn-outline')}
        >
          {showArchived ? 'Viewing archive' : 'View archive'}
        </button>
      </div>

      {error && <ErrorNotice message={error.message} onRetry={reload} />}

      {loading && !data ? (
        <SkeletonRows rows={3} />
      ) : notes.length === 0 ? (
        <EmptyState
          title={
            debounced
              ? `No notes matched "${debounced}".`
              : showArchived
                ? 'Nothing in the archive.'
                : 'No notes yet.'
          }
          body={
            showArchived
              ? 'Notes you archive, including ones turned into tasks, are kept here.'
              : 'Jot down anything you need to remember. Only you will see it.'
          }
        />
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section>
              <SectionHeading title="Pinned" count={pinned.length} />
              <div className="grid gap-2 sm:grid-cols-2">
                {pinned.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onPin={() => patch(note, { pinned: false }, 'Note unpinned.')}
                    onArchive={() =>
                      patch(
                        note,
                        { archived: !note.archived },
                        note.archived ? 'Note restored.' : 'Note archived.'
                      )
                    }
                    onEdit={() => {
                      setEditing(note);
                      setEditDraft({ title: note.title, content: note.content });
                    }}
                    onDelete={() => setRemoving(note)}
                    onConvert={() => setConverting(note)}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            {pinned.length > 0 && <SectionHeading title="All notes" count={rest.length} />}
            <div className="grid gap-2 sm:grid-cols-2">
              {rest.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onPin={() => patch(note, { pinned: true }, 'Note pinned.')}
                  onArchive={() =>
                    patch(
                      note,
                      { archived: !note.archived },
                      note.archived ? 'Note restored.' : 'Note archived.'
                    )
                  }
                  onEdit={() => {
                    setEditing(note);
                    setEditDraft({ title: note.title, content: note.content });
                  }}
                  onDelete={() => setRemoving(note)}
                  onConvert={() => setConverting(note)}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit note"
        footer={
          <>
            <button type="button" className="btn btn-md btn-outline" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-md btn-primary" onClick={saveEdit} disabled={busy}>
              {busy ? 'Saving...' : 'Save changes'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="field-label" htmlFor="edit-note-title">
              Title
            </label>
            <input
              id="edit-note-title"
              value={editDraft.title}
              onChange={(changeEvent) =>
                setEditDraft((current) => ({ ...current, title: changeEvent.target.value }))
              }
              className="field"
              maxLength={160}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="edit-note-content">
              Note
            </label>
            <textarea
              id="edit-note-content"
              value={editDraft.content}
              onChange={(changeEvent) =>
                setEditDraft((current) => ({ ...current, content: changeEvent.target.value }))
              }
              rows={5}
              className="field resize-y"
              maxLength={8000}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title="Delete this note?"
        message="This cannot be undone. If you may need it later, archive it instead."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />

      {converting && (
        <ConvertNoteDialog
          note={converting}
          onClose={() => setConverting(null)}
          onDone={() => {
            setConverting(null);
            invalidate('/notes');
            reload();
          }}
        />
      )}
    </div>
  );
}

function NoteCard({
  note,
  onPin,
  onArchive,
  onEdit,
  onDelete,
  onConvert,
}: {
  note: QuickNote;
  onPin: () => void;
  onArchive: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
}) {
  // A note saved without a title gets one derived from its first line, so the
  // body is only worth repeating when it actually says something more.
  const bodyAddsSomething = note.content.trim() !== '' && note.content.trim() !== note.title.trim();

  return (
    <article className="card flex flex-col p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink">{note.title || 'Untitled note'}</h3>
        {note.pinned && <Pill className="border-transparent bg-accent text-accent-ink">Pinned</Pill>}
        {note.archived && <Pill className="border-hairline bg-raised text-muted">Archived</Pill>}
      </div>

      {bodyAddsSomething && (
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted">{note.content}</p>
      )}

      <p className="mt-2 text-2xs text-faint">Updated {formatTimestamp(note.updated_at)}</p>

      <div className="mt-3 flex flex-wrap gap-1 border-t border-hairline pt-2.5">
        <button type="button" onClick={onConvert} className="btn btn-sm btn-ghost text-2xs text-accent">
          Convert to task
        </button>
        <button type="button" onClick={onEdit} className="btn btn-sm btn-ghost text-2xs">
          Edit
        </button>
        <button type="button" onClick={onPin} className="btn btn-sm btn-ghost text-2xs">
          {note.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" onClick={onArchive} className="btn btn-sm btn-ghost text-2xs">
          {note.archived ? 'Restore' : 'Archive'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="btn btn-sm btn-ghost ml-auto text-2xs hover:text-error"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

/** Note -> responsibility (spec 16): a passing thought becomes real work. */
function ConvertNoteDialog({
  note,
  onClose,
  onDone,
}: {
  note: QuickNote;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const today = todayISO();

  const [eventId, setEventId] = useState('');
  const [title, setTitle] = useState(note.title || note.content.slice(0, 80));
  const [team, setTeam] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [taskNote, setTaskNote] = useState(note.content);
  const [dueAt, setDueAt] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [archiveNote, setArchiveNote] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Only forthcoming events are worth attaching a new task to.
  const { data: events } = useQuery<EventListResponse>(
    `/events${buildQuery({ from: today, limit: 100 })}`,
    { staleMs: 30_000 }
  );
  const { data: assignees } = useQuery<AssigneesResponse>('/meta/assignees', { staleMs: 120_000 });

  const submit = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      await api(`/notes/${note.id}/convert`, {
        method: 'POST',
        body: {
          event_id: Number(eventId),
          title,
          assigned_team: team,
          assigned_user_id: assignedUserId ? Number(assignedUserId) : null,
          note: taskNote,
          due_at: dueAt ? dueAt.replace('T', ' ') : null,
          public_visibility: isPublic,
          archive_note: archiveNote,
        },
      });
      invalidate('/events');
      invalidate('/overview');
      invalidate('/tasks');
      notify('Note turned into a responsibility.');
      onDone();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 400) {
        setFieldErrors(cause.fieldErrors);
        notify(cause.message, 'error');
      } else {
        notify(
          cause instanceof ApiError ? cause.message : 'We could not create that task.',
          'error'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Convert note to responsibility"
      description="Pick the event this belongs to and who owns it."
      footer={
        <>
          <button type="button" className="btn btn-md btn-outline" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-md btn-primary"
            onClick={submit}
            disabled={saving || !eventId || title.trim().length === 0}
          >
            {saving ? 'Creating...' : 'Create responsibility'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="field-label" htmlFor="convert-event">
            Event
          </label>
          <select
            id="convert-event"
            value={eventId}
            onChange={(changeEvent) => setEventId(changeEvent.target.value)}
            className="field"
            required
          >
            <option value="">Choose an event</option>
            {(events?.events ?? []).map((event) => (
              <option key={event.id} value={event.id}>
                {formatMediumDate(event.event_date)} &mdash; {event.title}
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors.event_id} />
        </div>

        <div>
          <label className="field-label" htmlFor="convert-title">
            Task
          </label>
          <input
            id="convert-title"
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            className="field"
            maxLength={180}
            required
          />
          <FieldError message={fieldErrors.title} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="convert-team">
              Assigned to
            </label>
            <input
              id="convert-team"
              value={team}
              onChange={(changeEvent) => setTeam(changeEvent.target.value)}
              list="convert-teams"
              placeholder="Media Club"
              className="field"
              maxLength={120}
            />
            <datalist id="convert-teams">
              {(assignees?.teams ?? []).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="field-label" htmlFor="convert-admin">
              Or an administrator
            </label>
            <select
              id="convert-admin"
              value={assignedUserId}
              onChange={(changeEvent) => setAssignedUserId(changeEvent.target.value)}
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

        <div>
          <label className="field-label" htmlFor="convert-note">
            Note
          </label>
          <textarea
            id="convert-note"
            value={taskNote}
            onChange={(changeEvent) => setTaskNote(changeEvent.target.value)}
            rows={3}
            className="field resize-y"
            maxLength={2000}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="convert-due">
              Due (optional)
            </label>
            <input
              id="convert-due"
              type="datetime-local"
              value={dueAt}
              onChange={(changeEvent) => setDueAt(changeEvent.target.value)}
              className="field"
            />
          </div>
          <div className="space-y-1.5 pt-5">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(changeEvent) => setIsPublic(changeEvent.target.checked)}
                className="h-4 w-4 rounded border-edge text-ink focus:ring-ink/20"
              />
              Visible to the public
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={archiveNote}
                onChange={(changeEvent) => setArchiveNote(changeEvent.target.checked)}
                className="h-4 w-4 rounded border-edge text-ink focus:ring-ink/20"
              />
              Archive this note
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}
