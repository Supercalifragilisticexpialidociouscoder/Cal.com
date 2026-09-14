import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { invalidate, useQuery } from '../api/useQuery';
import type { AssigneesResponse, EventDetail } from '../api/types';
import { ActivityPanel, AttachmentsPanel, EventNotesPanel } from '../components/EventSidePanels';
import { ConfirmDialog, Modal } from '../components/Modal';
import { ReadinessBar } from '../components/ReadinessBar';
import { ResponsibilityPanel } from '../components/ResponsibilityPanel';
import { ErrorNotice, Pill, SkeletonRows, Spinner } from '../components/ui';
import { cn } from '../lib/cn';
import {
  formatDistanceInDays,
  formatFullDate,
  formatTimeRange,
  formatTimestamp,
  todayISO,
} from '../lib/date';
import {
  EVENT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_PILL,
  eventAccent,
  eventPill,
} from '../lib/taxonomy';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

/** The full event page (spec 8, 29). */
export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const today = todayISO();

  const path = id ? `/events/${id}` : null;
  const { data, error, loading, refreshing, reload } = useQuery<EventDetail>(path, {
    staleMs: isAdmin ? 3_000 : 30_000,
  });

  const { data: assignees } = useQuery<AssigneesResponse>(isAdmin ? '/meta/assignees' : null, {
    staleMs: 120_000,
  });

  const [archiving, setArchiving] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState('');
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorNotice message={error.message} onRetry={error.status === 404 ? undefined : reload} />
        {error.status === 404 && (
          <Link to="/events" className="btn btn-md btn-outline">
            Browse all events
          </Link>
        )}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <SkeletonRows rows={5} />
      </div>
    );
  }

  if (!data) return null;

  const { event, responsibilities, attachments, notes, activity } = data;
  const isPast = event.event_date < today;

  const archive = async () => {
    setBusy(true);
    try {
      await api(`/events/${event.id}`, { method: 'DELETE' });
      invalidate('/events');
      invalidate('/overview');
      notify(`"${event.title}" has been archived.`);
      navigate('/events');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not archive that event.', 'error');
      setBusy(false);
      setArchiving(false);
    }
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const response = await api<{ event: { id: number } }>(`/events/${event.id}/duplicate`, {
        method: 'POST',
        body: { event_date: duplicateDate || event.event_date, copy_responsibilities: true },
      });
      invalidate('/events');
      invalidate('/overview');
      setDuplicateOpen(false);
      notify('Event duplicated. Adjust the details and save.');
      navigate(`/admin/events/${response.event.id}/edit`);
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not duplicate that event.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await api(`/events/${event.id}/restore`, { method: 'POST' });
      invalidate('/events');
      invalidate('/overview');
      reload();
      notify('Event restored.');
    } catch (cause) {
      notify(cause instanceof ApiError ? cause.message : 'We could not restore that event.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        {refreshing && <Spinner label="Refreshing" />}
      </div>

      {event.archived && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-attention-edge bg-attention-wash px-4 py-3 text-sm">
          <p className="font-medium text-attention-text">
            This event is archived. It no longer appears on the calendar.
          </p>
          <button type="button" onClick={restore} disabled={busy} className="btn btn-sm btn-outline">
            Restore event
          </button>
        </div>
      )}

      {/* HEADER ------------------------------------------------------------- */}
      <header className="relative overflow-hidden rounded-xl border border-hairline bg-surface p-5 shadow-card sm:p-6">
        <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1', eventAccent(event))} />

        <div className="flex flex-wrap items-center gap-1.5">
          <Pill className={eventPill(event)}>{event.organizer_name}</Pill>
          <Pill className="border-hairline bg-raised text-muted">
            {EVENT_TYPE_LABELS[event.event_type]}
          </Pill>
          {event.important && (
            <Pill className="border-transparent bg-accent text-accent-ink">Important</Pill>
          )}
          {event.is_public === false && (
            <Pill className="border-hairline bg-raised text-muted">Internal event</Pill>
          )}
        </div>

        <h1 className="mt-2.5 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {event.title}
        </h1>

        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Date">
            {formatFullDate(event.event_date)}
            <span className="ml-1.5 text-xs font-normal text-faint">
              {formatDistanceInDays(event.event_date, today)}
            </span>
          </Detail>
          <Detail label="Time">{formatTimeRange(event.start_time, event.end_time, event.all_day)}</Detail>
          <Detail label="Location">{event.location || 'To be announced'}</Detail>
          <Detail label="Status">
            <Pill className={STATUS_PILL[event.status]}>{STATUS_LABELS[event.status]}</Pill>
          </Detail>
        </dl>

        {isAdmin && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
            <Link to={`/admin/events/${event.id}/edit`} className="btn btn-sm btn-primary">
              Edit event
            </Link>
            <button
              type="button"
              onClick={() => {
                setDuplicateDate(event.event_date);
                setDuplicateOpen(true);
              }}
              className="btn btn-sm btn-outline"
            >
              Duplicate
            </button>
            {!event.archived && (
              <button type="button" onClick={() => setArchiving(true)} className="btn btn-sm btn-outline">
                Delete event
              </button>
            )}
            {event.created_by_name && (
              <p className="ml-auto self-center text-2xs text-faint">
                Created by {event.created_by_name}
                {event.created_at ? ` · ${formatTimestamp(event.created_at)}` : ''}
              </p>
            )}
          </div>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {event.description && (
            <section aria-labelledby="description-heading" className="card p-4 sm:p-5">
              <h2 id="description-heading" className="mb-2 text-sm font-semibold text-ink">
                Description
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                {event.description}
              </p>
            </section>
          )}

          <ResponsibilityPanel
            eventId={event.id}
            responsibilities={responsibilities}
            publicCount={event.public_responsibility_count}
            totalCount={event.readiness?.total ?? responsibilities.length}
            assignees={assignees}
            onChanged={reload}
          />

          {isAdmin && notes && (
            <EventNotesPanel eventId={event.id} notes={notes} onChanged={reload} />
          )}
        </div>

        <div className="space-y-4">
          {event.readiness && (
            <section aria-labelledby="readiness-heading" className="card p-4 sm:p-5">
              <h2 id="readiness-heading" className="mb-3 text-sm font-semibold text-ink">
                Event readiness
              </h2>
              <p className="mb-2 text-2xl font-semibold tabular-nums text-ink">
                {event.readiness.percent}%
              </p>
              <ReadinessBar readiness={event.readiness} />
              {isPast && event.status !== 'completed' && event.readiness.percent < 100 && (
                <p className="mt-3 text-xs text-muted">
                  This event has passed with tasks still open.
                </p>
              )}
            </section>
          )}

          <AttachmentsPanel eventId={event.id} attachments={attachments} onChanged={reload} />

          {isAdmin && activity && <ActivityPanel activity={activity} />}

          {!isAdmin && (
            <section className="rounded-xl border border-dashed border-hairline px-4 py-3.5">
              <p className="text-xs leading-relaxed text-muted">
                Organised by <span className="font-medium text-ink">{event.organizer_name}</span>. For
                questions about this event, contact the organising club or department.
              </p>
            </section>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={archiving}
        title="Are you sure you want to delete this event?"
        message={`"${event.title}" will be archived and removed from the calendar. A Super Admin can restore it afterwards.`}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={archive}
        onCancel={() => setArchiving(false)}
      />

      <Modal
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        title="Duplicate this event"
        description="The details and checklist are copied. Task progress starts fresh."
        footer={
          <>
            <button
              type="button"
              className="btn btn-md btn-outline"
              onClick={() => setDuplicateOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="button" className="btn btn-md btn-primary" onClick={duplicate} disabled={busy}>
              {busy ? 'Duplicating...' : 'Duplicate event'}
            </button>
          </>
        }
      >
        <label className="field-label" htmlFor="duplicate-date">
          New date
        </label>
        <input
          id="duplicate-date"
          type="date"
          value={duplicateDate}
          onChange={(changeEvent) => setDuplicateDate(changeEvent.target.value)}
          className="field"
        />
      </Modal>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/events" className="btn btn-sm btn-ghost -ml-2 gap-1.5">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M10 3L5 8l5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      All events
    </Link>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="section-title">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}
