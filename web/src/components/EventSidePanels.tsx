import { useRef, useState } from 'react';
import { ApiError, api } from '../api/client';
import { invalidate } from '../api/useQuery';
import type { ActivityEntry, Attachment, EventNote } from '../api/types';
import { cn } from '../lib/cn';
import { formatFileSize, formatTimestamp } from '../lib/date';
import { describeActivity } from '../lib/taxonomy';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { ConfirmDialog } from './Modal';
import { EmptyState, Pill } from './ui';

/**
 * Event notes: shared operational context for administrators, never mixed up
 * with private Quick Notes (spec 17).
 */
export function EventNotesPanel({
  eventId,
  notes,
  onChanged,
}: {
  eventId: number;
  notes: EventNote[];
  onChanged: () => void;
}) {
  const { viewer, isSuperAdmin } = useAuth();
  const { notify } = useToast();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<EventNote | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    try {
      await api(`/events/${eventId}/notes`, { method: 'POST', body: { content } });
      setDraft('');
      invalidate(`/events/${eventId}`);
      onChanged();
      notify('Note added to this event.');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'We could not save that note.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/event-notes/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      invalidate(`/events/${eventId}`);
      onChanged();
      notify('Note removed.');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'We could not remove that note.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="event-notes-heading" className="card p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 id="event-notes-heading" className="text-sm font-semibold text-ink">
          Event notes
        </h2>
        <Pill className="border-hairline bg-raised text-muted">Admins only</Pill>
      </div>
      <p className="mb-3 text-xs text-muted">
        Shared context for the administrators working on this event.
      </p>

      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Sir requested the final poster be approved first."
          className="field"
          maxLength={4000}
          aria-label="New event note"
        />
        <button type="submit" disabled={saving || draft.trim().length === 0} className="btn btn-md btn-primary shrink-0">
          {saving ? 'Saving...' : 'Add'}
        </button>
      </form>

      {notes.length === 0 ? (
        <EmptyState title="No event notes yet." compact />
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-hairline bg-raised/40 px-3 py-2.5">
              <p className="text-sm text-ink">{note.content}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-2xs text-faint">
                  {note.author_name ?? 'An administrator'} &middot; {formatTimestamp(note.created_at)}
                </p>
                {(note.created_by === viewer?.id || isSuperAdmin) && (
                  <button
                    type="button"
                    onClick={() => setRemoving(note)}
                    className="text-2xs font-medium text-muted transition-colors hover:text-error"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this note?"
        message="The note will be deleted from this event."
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

/**
 * Attachments (spec 18). Files are private by default; publishing one is an
 * explicit act, and the server enforces it on download.
 */
export function AttachmentsPanel({
  eventId,
  attachments,
  onChanged,
}: {
  eventId: number;
  attachments: Attachment[];
  onChanged: () => void;
}) {
  const { isAdmin } = useAuth();
  const { notify } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [publishOnUpload, setPublishOnUpload] = useState(false);
  const [removing, setRemoving] = useState<Attachment | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('public_visibility', String(publishOnUpload));
      await api(`/events/${eventId}/attachments`, { method: 'POST', formData });
      invalidate(`/events/${eventId}`);
      onChanged();
      notify(`${file.name} attached.`);
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'We could not upload that file.', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const togglePublic = async (attachment: Attachment) => {
    try {
      await api(`/attachments/${attachment.id}`, {
        method: 'PATCH',
        body: { public_visibility: !attachment.public_visibility },
      });
      invalidate(`/events/${eventId}`);
      onChanged();
      notify(
        attachment.public_visibility
          ? `${attachment.file_name} is now internal.`
          : `${attachment.file_name} is now public.`
      );
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'We could not update that file.', 'error');
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/attachments/${removing.id}`, { method: 'DELETE' });
      setRemoving(null);
      invalidate(`/events/${eventId}`);
      onChanged();
      notify('File removed.');
    } catch (error) {
      notify(error instanceof ApiError ? error.message : 'We could not remove that file.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin && attachments.length === 0) return null;

  return (
    <section aria-labelledby="files-heading" className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="files-heading" className="text-sm font-semibold text-ink">
          Files
        </h2>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-2xs text-muted">
              <input
                type="checkbox"
                checked={publishOnUpload}
                onChange={(event) => setPublishOnUpload(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-edge text-ink focus:ring-ink/20"
              />
              Publish on upload
            </label>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="btn btn-sm btn-outline"
            >
              {uploading ? 'Uploading...' : '+ Attach file'}
            </button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </div>
        )}
      </div>

      {attachments.length === 0 ? (
        <EmptyState
          title="No files attached."
          body="Proposals, budgets, posters and participant lists can live here."
          compact
        />
      ) : (
        <ul className="divide-y divide-hairline">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-3 py-2.5">
              <span aria-hidden="true" className="text-base">
                {fileIcon(attachment.mime_type, attachment.file_name)}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={attachment.download_url}
                  className="block truncate text-sm font-medium text-ink hover:text-accent hover:underline"
                >
                  {attachment.file_name}
                </a>
                <p className="text-2xs text-faint">
                  {formatFileSize(attachment.size_bytes)}
                  {attachment.uploaded_by_name ? ` · ${attachment.uploaded_by_name}` : ''}
                </p>
              </div>

              {isAdmin && (
                <>
                  <Pill
                    className={
                      attachment.public_visibility
                        ? 'border-transparent bg-success-wash text-success-text'
                        : 'border-hairline bg-raised text-muted'
                    }
                  >
                    {attachment.public_visibility ? 'Public' : 'Internal'}
                  </Pill>
                  <button
                    type="button"
                    onClick={() => togglePublic(attachment)}
                    className="btn btn-sm btn-ghost px-1.5 text-2xs"
                  >
                    {attachment.public_visibility ? 'Make internal' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(attachment)}
                    className="btn btn-sm btn-ghost px-1.5"
                    aria-label={`Remove ${attachment.file_name}`}
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
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this file?"
        message={`${removing?.file_name ?? 'The file'} will be deleted from the server.`}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

/** The internal accountability trail (spec 25). Never shown to the public. */
export function ActivityPanel({ activity }: { activity: ActivityEntry[] }) {
  const { viewer } = useAuth();

  if (activity.length === 0) return null;

  return (
    <section aria-labelledby="activity-heading" className="card p-4 sm:p-5">
      <h2 id="activity-heading" className="mb-3 text-sm font-semibold text-ink">
        Activity
      </h2>
      <ol className="space-y-2.5">
        {activity.map((entry) => (
          <li key={entry.id} className="flex gap-2.5 text-xs">
            <span
              aria-hidden="true"
              className={cn(
                'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                entry.user_id === viewer?.id ? 'bg-accent' : 'bg-edge'
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-ink">
                {describeActivity(
                  entry.action,
                  entry.metadata,
                  entry.user_name,
                  entry.user_id === viewer?.id
                )}
              </p>
              <p className="text-2xs text-faint">{formatTimestamp(entry.created_at)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function fileIcon(mimeType: string, fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (extension === 'pdf') return '📄';
  if (['xls', 'xlsx', 'csv'].includes(extension)) return '📊';
  if (['doc', 'docx'].includes(extension)) return '📝';
  if (['ppt', 'pptx'].includes(extension)) return '📑';
  if (['zip', 'rar', '7z'].includes(extension)) return '🗜️';
  return '📎';
}
