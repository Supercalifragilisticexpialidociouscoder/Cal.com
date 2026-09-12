import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { invalidate, useQuery } from '../../api/useQuery';
import type {
  CalendarEvent,
  Conflict,
  EventDetail,
  EventStatus,
  EventType,
  MetaResponse,
  RepeatRule,
  VenueConflict,
} from '../../api/types';
import { ConflictWarning } from '../../components/ConflictWarning';
import { ErrorNotice, FieldError, SkeletonRows } from '../../components/ui';
import { cn } from '../../lib/cn';
import { addDays, todayISO } from '../../lib/date';
import { EVENT_TYPE_LABELS, STATUS_LABELS } from '../../lib/taxonomy';
import { useToast } from '../../state/ToastContext';

interface FormState {
  title: string;
  description: string;
  event_type: EventType;
  organizer_id: string;
  organizer_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string;
  status: EventStatus;
  important: boolean;
  is_public: boolean;
  repeat_rule: RepeatRule;
  repeat_interval: string;
  repeat_until: string;
}

function initialState(today: string): FormState {
  return {
    title: '',
    description: '',
    event_type: 'event',
    organizer_id: '',
    organizer_name: '',
    event_date: today,
    start_time: '',
    end_time: '',
    all_day: false,
    location: '',
    status: 'planning',
    important: false,
    is_public: true,
    repeat_rule: 'none',
    repeat_interval: '1',
    repeat_until: '',
  };
}

function fromEvent(event: CalendarEvent): FormState {
  return {
    title: event.title,
    description: event.description,
    event_type: event.event_type,
    organizer_id: event.organizer ? String(event.organizer.id) : '',
    organizer_name: event.organizer ? '' : event.organizer_name,
    event_date: event.event_date,
    start_time: event.start_time ?? '',
    end_time: event.end_time ?? '',
    all_day: event.all_day,
    location: event.location,
    status: event.status,
    important: event.important,
    is_public: event.is_public !== false,
    repeat_rule: 'none',
    repeat_interval: '1',
    repeat_until: '',
  };
}

/** Create and edit share one form (spec 7). */
export function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const today = todayISO();
  const navigate = useNavigate();
  const { notify } = useToast();

  const { data: meta } = useQuery<MetaResponse>('/meta', { staleMs: 120_000 });
  const { data: existing, error: loadError, loading } = useQuery<EventDetail>(
    isEdit ? `/events/${id}` : null,
    { staleMs: 0 }
  );

  const [form, setForm] = useState<FormState>(() => initialState(today));
  const [hydrated, setHydrated] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflictPrompt, setConflictPrompt] = useState<{ message: string; conflicts: Conflict[] } | null>(
    null
  );
  const [liveConflicts, setLiveConflicts] = useState<VenueConflict[]>([]);

  useEffect(() => {
    if (isEdit && existing && !hydrated) {
      setForm(fromEvent(existing.event));
      setHydrated(true);
    }
  }, [isEdit, existing, hydrated]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  // Warn about a double-booked venue while the form is being filled in, not
  // only when saving (spec 23).
  useEffect(() => {
    if (!form.location.trim() || !form.event_date) {
      setLiveConflicts([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<{ conflicts: VenueConflict[] }>('/events/check-conflicts', {
        method: 'POST',
        signal: controller.signal,
        body: {
          id: isEdit ? Number(id) : null,
          event_date: form.event_date,
          location: form.location,
          start_time: form.all_day ? null : form.start_time || null,
          end_time: form.all_day ? null : form.end_time || null,
          all_day: form.all_day,
        },
      })
        .then((response) => setLiveConflicts(response.conflicts))
        .catch(() => setLiveConflicts([]));
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.location, form.event_date, form.start_time, form.end_time, form.all_day, id, isEdit]);

  const organizations = meta?.organizations ?? [];
  const locations = useMemo(() => {
    const names = new Set<string>();
    for (const venue of meta?.venues ?? []) names.add(venue.name);
    for (const location of meta?.locations ?? []) names.add(location);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [meta]);

  const submit = async (override: boolean) => {
    setSaving(true);
    setFieldErrors({});
    if (!override) setConflictPrompt(null);

    const body = {
      title: form.title,
      description: form.description,
      event_type: form.event_type,
      organizer_id: form.organizer_id ? Number(form.organizer_id) : null,
      organizer_name: form.organizer_id ? '' : form.organizer_name,
      event_date: form.event_date,
      start_time: form.all_day ? '' : form.start_time,
      end_time: form.all_day ? '' : form.end_time,
      all_day: form.all_day,
      location: form.location,
      status: form.status,
      important: form.important,
      is_public: form.is_public,
      override_conflicts: override,
      ...(isEdit
        ? {}
        : {
            repeat_rule: form.repeat_rule,
            repeat_interval: Number(form.repeat_interval) || 1,
            repeat_until: form.repeat_until,
          }),
    };

    try {
      if (isEdit) {
        await api(`/events/${id}`, { method: 'PATCH', body });
        invalidate('/events');
        invalidate('/overview');
        notify('Event updated.');
        navigate(`/events/${id}`);
      } else {
        const response = await api<{ event: { id: number }; occurrences_created: number }>('/events', {
          method: 'POST',
          body,
        });
        invalidate('/events');
        invalidate('/overview');
        notify(
          response.occurrences_created > 1
            ? `Event created with ${response.occurrences_created} occurrences.`
            : 'Event created.'
        );
        navigate(`/events/${response.event.id}`);
      }
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.status === 409 && cause.canOverride) {
          setConflictPrompt({ message: cause.message, conflicts: cause.conflicts });
        } else if (cause.status === 400) {
          setFieldErrors(cause.fieldErrors);
          notify(cause.message, 'error');
        } else {
          notify(cause.message, 'error');
        }
      } else {
        notify('Something went wrong while saving the event. Please try again.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && loadError) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={loadError.message} />
        <Link to="/events" className="btn btn-md btn-outline">
          Back to events
        </Link>
      </div>
    );
  }

  if (isEdit && loading && !existing) {
    return <SkeletonRows rows={6} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {isEdit ? 'Edit event' : 'Create event'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {isEdit
            ? 'Changes are recorded in the event history.'
            : 'Only the name and date are required. Everything else can follow later.'}
        </p>
      </header>

      <form
        className="space-y-5"
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          void submit(false);
        }}
      >
        <section className="card space-y-4 p-4 sm:p-5">
          <div>
            <label className="field-label" htmlFor="event-title">
              Event name
            </label>
            <input
              id="event-title"
              autoFocus
              value={form.title}
              onChange={(changeEvent) => set('title', changeEvent.target.value)}
              placeholder="MRTC Technical Workshop"
              className="field"
              required
              maxLength={180}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="event-type">
                Event type
              </label>
              <select
                id="event-type"
                value={form.event_type}
                onChange={(changeEvent) => set('event_type', changeEvent.target.value as EventType)}
                className="field"
              >
                {(meta?.taxonomy.event_types ?? []).map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              {form.event_type === 'deadline' && (
                <p className="mt-1 text-2xs text-muted">
                  Deadlines are listed separately on the home page.
                </p>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="event-organizer">
                Organiser
              </label>
              <select
                id="event-organizer"
                value={form.organizer_id}
                onChange={(changeEvent) => set('organizer_id', changeEvent.target.value)}
                className="field"
              >
                <option value="">Other (type a name)</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
              {!form.organizer_id && (
                <input
                  value={form.organizer_name}
                  onChange={(changeEvent) => set('organizer_name', changeEvent.target.value)}
                  placeholder="MRTC"
                  className="field mt-2"
                  maxLength={120}
                  aria-label="Organiser name"
                />
              )}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="event-description">
              Description
            </label>
            <textarea
              id="event-description"
              value={form.description}
              onChange={(changeEvent) => set('description', changeEvent.target.value)}
              rows={4}
              placeholder="What is happening, who it is for, and anything students should bring."
              className="field resize-y"
              maxLength={8000}
            />
          </div>
        </section>

        <section className="card space-y-4 p-4 sm:p-5">
          <h2 className="section-title">When and where</h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="event-date">
                Date
              </label>
              <input
                id="event-date"
                type="date"
                value={form.event_date}
                onChange={(changeEvent) => set('event_date', changeEvent.target.value)}
                className="field"
                required
              />
              <FieldError message={fieldErrors.event_date} />
            </div>

            <div>
              <label className="field-label" htmlFor="event-start">
                Start time
              </label>
              <input
                id="event-start"
                type="time"
                value={form.start_time}
                onChange={(changeEvent) => set('start_time', changeEvent.target.value)}
                disabled={form.all_day}
                className={cn('field', form.all_day && 'opacity-50')}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="event-end">
                End time
              </label>
              <input
                id="event-end"
                type="time"
                value={form.end_time}
                onChange={(changeEvent) => set('end_time', changeEvent.target.value)}
                disabled={form.all_day}
                className={cn('field', form.all_day && 'opacity-50')}
              />
              <FieldError message={fieldErrors.end_time} />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={(changeEvent) => set('all_day', changeEvent.target.checked)}
              className="h-4 w-4 rounded border-edge text-accent focus:ring-accent/40"
            />
            All day
          </label>

          <div>
            <label className="field-label" htmlFor="event-location">
              Location
            </label>
            <input
              id="event-location"
              value={form.location}
              onChange={(changeEvent) => set('location', changeEvent.target.value)}
              list="event-locations"
              placeholder="Seminar Hall"
              className="field"
              maxLength={160}
            />
            <datalist id="event-locations">
              {locations.map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
          </div>

          {liveConflicts.length > 0 && !conflictPrompt && (
            <ConflictWarning
              message={`${form.location} already has something booked at this time. You can still continue.`}
              conflicts={liveConflicts}
            />
          )}
        </section>

        <section className="card space-y-4 p-4 sm:p-5">
          <h2 className="section-title">Status and visibility</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="event-status">
                Status
              </label>
              <select
                id="event-status"
                value={form.status}
                onChange={(changeEvent) => set('status', changeEvent.target.value as EventStatus)}
                className="field"
              >
                {(meta?.taxonomy.event_statuses ?? []).map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.important}
                  onChange={(changeEvent) => set('important', changeEvent.target.checked)}
                  className="h-4 w-4 rounded border-edge text-accent focus:ring-accent/40"
                />
                Important event
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.is_public}
                  onChange={(changeEvent) => set('is_public', changeEvent.target.checked)}
                  className="h-4 w-4 rounded border-edge text-accent focus:ring-accent/40"
                />
                Show on the public calendar
              </label>
            </div>
          </div>

          {!form.is_public && (
            <p className="rounded-lg bg-raised px-3 py-2 text-xs text-muted">
              Internal events are visible to administrators only. Students will not see this event.
            </p>
          )}
        </section>

        {!isEdit && (
          <section className="card space-y-4 p-4 sm:p-5">
            <h2 className="section-title">Repeat</h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="event-repeat">
                  Repeats
                </label>
                <select
                  id="event-repeat"
                  value={form.repeat_rule}
                  onChange={(changeEvent) => set('repeat_rule', changeEvent.target.value as RepeatRule)}
                  className="field"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="custom">Custom (every N days)</option>
                </select>
              </div>

              {form.repeat_rule === 'custom' && (
                <div>
                  <label className="field-label" htmlFor="event-interval">
                    Every N days
                  </label>
                  <input
                    id="event-interval"
                    type="number"
                    min={1}
                    max={52}
                    value={form.repeat_interval}
                    onChange={(changeEvent) => set('repeat_interval', changeEvent.target.value)}
                    className="field"
                  />
                </div>
              )}

              {form.repeat_rule !== 'none' && (
                <div>
                  <label className="field-label" htmlFor="event-until">
                    Until
                  </label>
                  <input
                    id="event-until"
                    type="date"
                    value={form.repeat_until}
                    min={form.event_date}
                    max={addDays(form.event_date, 400)}
                    onChange={(changeEvent) => set('repeat_until', changeEvent.target.value)}
                    className="field"
                  />
                  <FieldError message={fieldErrors.repeat_until} />
                </div>
              )}
            </div>

            {form.repeat_rule !== 'none' && (
              <p className="text-2xs text-muted">
                Each occurrence is created as its own event, so you can change or cancel one without
                touching the rest.
              </p>
            )}
          </section>
        )}

        {conflictPrompt && (
          <ConflictWarning
            message={conflictPrompt.message}
            conflicts={conflictPrompt.conflicts}
            busy={saving}
            overrideLabel={isEdit ? 'Save anyway' : 'Create anyway'}
            onOverride={() => void submit(true)}
            onCancel={() => setConflictPrompt(null)}
          />
        )}

        <div className="flex flex-wrap gap-2 pb-4">
          <button
            type="submit"
            disabled={saving || form.title.trim().length === 0 || !form.event_date}
            className="btn btn-md btn-primary"
          >
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create event'}
          </button>
          <Link to={isEdit ? `/events/${id}` : '/events'} className="btn btn-md btn-outline">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
