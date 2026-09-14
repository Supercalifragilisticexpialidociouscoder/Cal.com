/**
 * Intercepts requests to /api and answers them from the in-memory store, so
 * the demo runs the real interface with no server behind it.
 *
 * The app's own network layer is untouched: it still calls fetch('/api/...')
 * exactly as it does against the Calendar API.
 */
import type { Viewer } from '../src/api/types';
import { addDays, todayISO } from '../src/lib/date';
import { USERS } from './data';
import {
  compareEvents,
  buildReadiness,
  findTeamConflicts,
  findVenueConflicts,
  logActivity,
  nextId,
  now,
  serializeAttachment,
  serializeEvent,
  serializeResponsibility,
  state,
  to12Hour,
  userName,
  type EventRow,
  type RespRow,
} from './store';

type Body = Record<string, unknown>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

const unauthorized = () => new HttpError(401, 'unauthorized', 'Please sign in as an administrator to do that.');
const forbidden = (m = 'Only the Super Admin can manage this.') => new HttpError(403, 'forbidden', m);
const notFound = (m = 'We could not find what you were looking for.') => new HttpError(404, 'not_found', m);

function requireAdmin(): Viewer {
  if (!state.viewer) throw unauthorized();
  return state.viewer;
}

function requireSuper(): Viewer {
  const viewer = requireAdmin();
  if (viewer.role !== 'super_admin') throw forbidden();
  return viewer;
}

const str = (body: Body, key: string, fallback = ''): string => {
  const value = body[key];
  return typeof value === 'string' ? value : fallback;
};
const bool = (body: Body, key: string, fallback = false): boolean => {
  const value = body[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return fallback;
};
const num = (body: Body, key: string): number | null => {
  const value = body[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
};

function liveEvents(viewer: Viewer | null): EventRow[] {
  return state.events.filter((row) => row.deleted_at === null && (viewer || row.is_public));
}

function eventOr404(id: number, viewer: Viewer | null): EventRow {
  const row = state.events.find((entry) => entry.id === id);
  if (!row) throw notFound('That event no longer exists.');
  if (!viewer && (!row.is_public || row.deleted_at !== null)) throw notFound('That event no longer exists.');
  return row;
}

/** Applies the same filters the server supports on GET /events. */
function filterEvents(params: URLSearchParams, viewer: Viewer | null): EventRow[] {
  const from = params.get('from');
  const to = params.get('to');
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const source = params.get('source');
  const organizerId = params.get('organizer_id');
  const eventType = params.get('event_type');
  const status = params.get('status');
  const important = params.get('important') === 'true';
  const deadlines = params.get('deadlines') === 'true';
  const includeArchived = Boolean(viewer) && params.get('include_archived') === 'true';

  return state.events
    .filter((row) => (includeArchived ? true : row.deleted_at === null))
    .filter((row) => (viewer ? true : row.is_public))
    .filter((row) => (from ? row.event_date >= from : true))
    .filter((row) => (to ? row.event_date <= to : true))
    .filter((row) => (eventType ? row.event_type === eventType : true))
    .filter((row) => (deadlines ? row.event_type === 'deadline' : true))
    .filter((row) => (status ? row.status === status : true))
    .filter((row) => (important ? row.important : true))
    .filter((row) => (organizerId ? row.organizer_id === Number(organizerId) : true))
    .filter((row) => {
      if (!source) return true;
      const org = state.organizations.find((entry) => entry.id === row.organizer_id);
      return org ? org.type === source : source === 'other';
    })
    .filter((row) => {
      if (!q) return true;
      const org = state.organizations.find((entry) => entry.id === row.organizer_id);
      return [row.title, row.description, row.location, row.organizer_name, org?.name ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
    .sort(compareEvents);
}

function overviewPayload(viewer: Viewer | null) {
  const today = todayISO();
  const visible = liveEvents(viewer);

  const payload: Record<string, unknown> = {
    today,
    today_events: visible.filter((row) => row.event_date === today).sort(compareEvents).map((row) => serializeEvent(row, viewer)),
    upcoming_events: visible
      .filter(
        (row) =>
          row.event_date > today &&
          row.event_date <= addDays(today, 120) &&
          row.status !== 'cancelled' &&
          row.event_type !== 'deadline'
      )
      .sort(compareEvents)
      .slice(0, 8)
      .map((row) => serializeEvent(row, viewer)),
    deadlines: visible
      .filter((row) => row.event_type === 'deadline' && row.event_date >= today && row.status !== 'cancelled')
      .sort(compareEvents)
      .slice(0, 6)
      .map((row) => serializeEvent(row, viewer)),
    important_events: visible
      .filter((row) => row.important && row.event_date >= today && row.status !== 'cancelled')
      .sort(compareEvents)
      .slice(0, 5)
      .map((row) => serializeEvent(row, viewer)),
  };

  if (viewer) {
    const myTasks = state.responsibilities
      .filter((resp) => resp.assigned_user_id === viewer.id && resp.status !== 'completed')
      .filter((resp) => {
        const event = state.events.find((row) => row.id === resp.event_id);
        return event && event.deleted_at === null && event.status !== 'cancelled';
      })
      .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
      .slice(0, 8);

    const readiness = state.events
      .filter(
        (row) =>
          row.deleted_at === null &&
          row.status !== 'completed' &&
          row.status !== 'cancelled' &&
          row.event_date >= today
      )
      .map((row) => {
        const resp = state.responsibilities.filter((entry) => entry.event_id === row.id);
        return {
          event_id: row.id,
          title: row.title,
          event_date: row.event_date,
          readiness: buildReadiness(resp.length, resp.filter((entry) => entry.status === 'completed').length),
        };
      })
      .filter((entry) => entry.readiness !== null)
      .sort((a, b) => (a.readiness as { percent: number }).percent - (b.readiness as { percent: number }).percent)
      .slice(0, 6);

    payload.admin = {
      stats: {
        events_today: state.events.filter((row) => row.deleted_at === null && row.event_date === today).length,
        my_open_tasks: state.responsibilities.filter(
          (resp) => resp.assigned_user_id === viewer.id && resp.status !== 'completed'
        ).length,
        pending_responsibilities_today: state.responsibilities.filter((resp) => {
          const event = state.events.find((row) => row.id === resp.event_id);
          return event && event.deleted_at === null && event.event_date === today && resp.status !== 'completed';
        }).length,
        deadlines_next_14_days: state.events.filter(
          (row) =>
            row.deleted_at === null &&
            row.event_type === 'deadline' &&
            row.event_date >= today &&
            row.event_date <= addDays(today, 14) &&
            row.status !== 'cancelled'
        ).length,
      },
      my_tasks: myTasks.map((resp) => {
        const event = state.events.find((row) => row.id === resp.event_id) as EventRow;
        return {
          ...serializeResponsibility(resp, viewer),
          event: { id: event.id, title: event.title, event_date: event.event_date },
        };
      }),
      readiness,
    };
  }

  return payload;
}

function eventDetail(id: number, viewer: Viewer | null) {
  const row = eventOr404(id, viewer);

  const responsibilities = state.responsibilities
    .filter((resp) => resp.event_id === id && (viewer || resp.public_visibility))
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .map((resp) => serializeResponsibility(resp, viewer));

  const attachments = state.attachments
    .filter((entry) => entry.event_id === id && (viewer || entry.public_visibility))
    .map(serializeAttachment);

  const payload: Record<string, unknown> = {
    event: serializeEvent(row, viewer),
    responsibilities,
    attachments,
  };

  if (viewer) {
    payload.notes = state.eventNotes
      .filter((note) => note.event_id === id)
      .map((note) => ({ ...note, author_name: userName(note.created_by) }))
      .reverse();
    payload.activity = state.activity
      .filter((entry) => entry.event_id === id)
      .slice(0, 50)
      .map((entry) => ({ ...entry, user_name: userName(entry.user_id) }));
  }

  return payload;
}

function createEvent(body: Body, viewer: Viewer) {
  const title = str(body, 'title').trim();
  const eventDate = str(body, 'event_date');
  if (!title) throw new HttpError(400, 'bad_request', 'An event needs a name.', { title: 'An event needs a name.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new HttpError(400, 'bad_request', 'Please provide a valid date.', { event_date: 'Please provide a valid date.' });
  }

  const allDay = bool(body, 'all_day');
  const startTime = allDay ? null : str(body, 'start_time') || null;
  const endTime = allDay ? null : str(body, 'end_time') || null;
  if (startTime && endTime && endTime <= startTime) {
    throw new HttpError(400, 'bad_request', 'The end time must be after the start time.', {
      end_time: 'The end time must be after the start time.',
    });
  }

  const location = str(body, 'location');
  if (!bool(body, 'override_conflicts') && location.trim()) {
    const conflicts = findVenueConflicts({
      location,
      event_date: eventDate,
      start_time: startTime,
      end_time: endTime,
      all_day: allDay,
    });
    if (conflicts.length > 0) {
      const first = conflicts[0];
      const when = first.all_day
        ? 'all day'
        : first.start_time && first.end_time
          ? `from ${to12Hour(first.start_time)} to ${to12Hour(first.end_time)}`
          : 'at an overlapping time';
      throw new HttpError(409, 'conflict', `${first.location} is already booked ${when} for "${first.title}".`, {
        conflicts,
        can_override: true,
      });
    }
  }

  const organizerId = num(body, 'organizer_id');
  const org = state.organizations.find((entry) => entry.id === organizerId) ?? null;

  // A repeat is materialised as individual events, as the server does.
  const rule = str(body, 'repeat_rule', 'none');
  const interval = Math.max(1, Math.min(52, num(body, 'repeat_interval') ?? 1));
  const until = str(body, 'repeat_until') || null;
  const dates: string[] = [];
  if (rule === 'none') dates.push(eventDate);
  else {
    const horizon = until || addDays(eventDate, 365);
    let cursor = eventDate;
    while (cursor <= horizon && dates.length < 60) {
      dates.push(cursor);
      cursor =
        rule === 'weekly'
          ? addDays(cursor, 7 * interval)
          : rule === 'monthly'
            ? addDays(cursor, 30 * interval)
            : addDays(cursor, interval);
    }
  }

  let firstId = 0;
  dates.forEach((date, index) => {
    const id = nextId('event');
    if (index === 0) firstId = id;
    state.events.push({
      id,
      title,
      description: str(body, 'description'),
      event_type: (str(body, 'event_type', 'event') as EventRow['event_type']) ?? 'event',
      organizer_id: org?.id ?? null,
      organizer_name: org?.name ?? (str(body, 'organizer_name').trim() || 'MRTC'),
      event_date: date,
      start_time: startTime,
      end_time: endTime,
      all_day: allDay,
      location,
      status: (str(body, 'status', 'planning') as EventRow['status']) ?? 'planning',
      important: bool(body, 'important'),
      is_public: bool(body, 'is_public', true),
      created_by: viewer.id,
      created_at: now(),
      updated_at: now(),
      deleted_at: null,
    });
  });

  logActivity('event.created', firstId, { title, occurrences: dates.length });
  const created = state.events.find((row) => row.id === firstId) as EventRow;
  return { event: serializeEvent(created, viewer), occurrences_created: dates.length };
}

function updateEvent(id: number, body: Body, viewer: Viewer) {
  const row = eventOr404(id, viewer);
  const before = { ...row };

  if (body.title !== undefined) row.title = str(body, 'title').trim() || row.title;
  if (body.description !== undefined) row.description = str(body, 'description');
  if (body.event_type !== undefined) row.event_type = str(body, 'event_type') as EventRow['event_type'];
  if (body.event_date !== undefined) row.event_date = str(body, 'event_date');
  if (body.location !== undefined) row.location = str(body, 'location');
  if (body.status !== undefined) row.status = str(body, 'status') as EventRow['status'];
  if (body.important !== undefined) row.important = bool(body, 'important');
  if (body.is_public !== undefined) row.is_public = bool(body, 'is_public');
  if (body.all_day !== undefined) row.all_day = bool(body, 'all_day');
  if (body.start_time !== undefined) row.start_time = str(body, 'start_time') || null;
  if (body.end_time !== undefined) row.end_time = str(body, 'end_time') || null;
  if (row.all_day) {
    row.start_time = null;
    row.end_time = null;
  }
  if (body.organizer_id !== undefined || body.organizer_name !== undefined) {
    const org = state.organizations.find((entry) => entry.id === num(body, 'organizer_id')) ?? null;
    row.organizer_id = org?.id ?? null;
    row.organizer_name = org?.name ?? (str(body, 'organizer_name').trim() || row.organizer_name);
  }

  if (row.start_time && row.end_time && row.end_time <= row.start_time) {
    Object.assign(row, before);
    throw new HttpError(400, 'bad_request', 'The end time must be after the start time.', {
      end_time: 'The end time must be after the start time.',
    });
  }

  const timingChanged =
    before.event_date !== row.event_date ||
    before.start_time !== row.start_time ||
    before.end_time !== row.end_time ||
    before.all_day !== row.all_day ||
    before.location.toLowerCase() !== row.location.toLowerCase();

  if (!bool(body, 'override_conflicts') && timingChanged && row.location.trim()) {
    const conflicts = findVenueConflicts({
      id,
      location: row.location,
      event_date: row.event_date,
      start_time: row.start_time,
      end_time: row.end_time,
      all_day: row.all_day,
    });
    if (conflicts.length > 0) {
      Object.assign(row, before);
      const first = conflicts[0];
      throw new HttpError(409, 'conflict', `${first.location} is already booked for "${first.title}".`, {
        conflicts,
        can_override: true,
      });
    }
  }

  row.updated_at = now();
  if (before.title !== row.title) logActivity('event.renamed', id, { from: before.title, to: row.title });
  if (before.location !== row.location) logActivity('event.location_changed', id, { from: before.location, to: row.location });
  if (before.event_date !== row.event_date) logActivity('event.date_changed', id, { from: before.event_date, to: row.event_date });
  if (before.status !== row.status) logActivity('event.status_changed', id, { from: before.status, to: row.status });
  if (before.important !== row.important) logActivity('event.importance_changed', id, { important: row.important });
  if (before.is_public !== row.is_public) logActivity('event.visibility_changed', id, { is_public: row.is_public });

  return { event: serializeEvent(row, viewer) };
}

function addResponsibility(eventId: number, body: Body, viewer: Viewer) {
  const event = state.events.find((row) => row.id === eventId && row.deleted_at === null);
  if (!event) throw notFound('That event no longer exists.');

  const title = str(body, 'title').trim();
  if (!title) {
    throw new HttpError(400, 'bad_request', 'A responsibility needs a task name.', {
      title: 'A responsibility needs a task name.',
    });
  }

  const team = str(body, 'assigned_team');
  if (!bool(body, 'override_conflicts') && team.trim()) {
    const conflicts = findTeamConflicts(team, eventId);
    if (conflicts.length > 0) {
      const first = conflicts[0];
      const when = first.start_time ? ` at ${to12Hour(first.start_time)}` : '';
      throw new HttpError(
        409,
        'conflict',
        `${first.team} is already assigned to "${first.responsibility_title}" for "${first.event_title}"${when}.`,
        { conflicts, can_override: true }
      );
    }
  }

  const position =
    Math.max(-1, ...state.responsibilities.filter((r) => r.event_id === eventId).map((r) => r.position)) + 1;
  const status = (str(body, 'status', 'not_started') as RespRow['status']) ?? 'not_started';

  const row: RespRow = {
    id: nextId('resp'),
    event_id: eventId,
    title,
    assigned_user_id: num(body, 'assigned_user_id'),
    assigned_team: team,
    note: str(body, 'note'),
    due_at: str(body, 'due_at') || null,
    status,
    public_visibility: bool(body, 'public_visibility'),
    position,
    completed_by: status === 'completed' ? viewer.id : null,
    completed_at: status === 'completed' ? now() : null,
    created_by: viewer.id,
    created_at: now(),
    updated_at: now(),
  };
  state.responsibilities.push(row);
  logActivity('responsibility.created', eventId, { title, assigned_to: team || null });

  return { responsibility: serializeResponsibility(row, viewer) };
}

function deriveTitle(content: string): string {
  const first = content.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  if (!first) return 'Untitled note';
  return first.length > 60 ? `${first.slice(0, 57)}...` : first;
}

/** Routes one request. Throws HttpError for anything the API would reject. */
function handle(method: string, path: string, params: URLSearchParams, body: Body, formData: FormData | null) {
  const viewer = state.viewer;
  const segments = path.split('/').filter(Boolean);

  // --- auth ---------------------------------------------------------------
  if (path === '/auth/me') return { user: viewer };

  if (path === '/auth/login' && method === 'POST') {
    const identifier = str(body, 'email').trim().toLowerCase();
    const password = str(body, 'password');
    const account = USERS.find(
      (user) => user.email === identifier || (!identifier.includes('@') && user.email.split('@')[0] === identifier)
    );
    if (!account || account.password !== password) {
      throw new HttpError(401, 'unauthorized', 'Incorrect username or password.');
    }
    if (!state.users.find((user) => user.id === account.id)?.active) {
      throw new HttpError(401, 'unauthorized', 'This administrator account has been deactivated.');
    }
    state.viewer = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      is_super_admin: account.role === 'super_admin',
    };
    logActivity('admin.signed_in', null, {});
    return { user: state.viewer };
  }

  if (path === '/auth/logout' && method === 'POST') {
    state.viewer = null;
    return { ok: true };
  }

  if (path === '/auth/password' && method === 'POST') {
    requireAdmin();
    throw new HttpError(403, 'forbidden', 'Passwords cannot be changed in the demo.');
  }

  // --- overview, meta, search --------------------------------------------
  if (path === '/overview') return overviewPayload(viewer);

  if (path === '/meta') {
    return {
      organizations: state.organizations.filter((org) => viewer || org.active),
      venues: state.venues.filter((venue) => viewer || venue.active),
      locations: [...new Set(state.events.filter((e) => e.deleted_at === null && e.location).map((e) => e.location))].sort(),
      taxonomy: {
        event_types: ['event', 'meeting', 'workshop', 'seminar', 'deadline', 'competition', 'academic', 'examination', 'faculty', 'other'],
        event_statuses: ['planning', 'confirmed', 'ongoing', 'completed', 'cancelled'],
        organization_types: ['institution', 'department', 'club', 'academic', 'other'],
        responsibility_statuses: ['not_started', 'in_progress', 'completed'],
        repeat_rules: ['none', 'daily', 'weekly', 'monthly', 'custom'],
      },
    };
  }

  if (path === '/meta/assignees') {
    const admin = requireAdmin();
    const teams = new Set<string>();
    for (const org of state.organizations) if (org.active) teams.add(org.name);
    for (const resp of state.responsibilities) if (resp.assigned_team) teams.add(resp.assigned_team);
    return {
      teams: [...teams].sort((a, b) => a.localeCompare(b)),
      admins: state.users
        .filter((user) => user.active)
        .map((user) => ({ id: user.id, name: user.name, role: user.role, is_you: user.id === admin.id })),
    };
  }

  if (path === '/search') {
    const raw = (params.get('q') ?? '').trim();
    if (raw.length < 2) return { query: raw, events: [], responsibilities: [], notes: [], organizations: [] };
    const q = raw.toLowerCase();

    const events = liveEvents(viewer)
      .filter((row) => {
        const org = state.organizations.find((entry) => entry.id === row.organizer_id);
        return [row.title, row.description, row.location, row.organizer_name, org?.name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort(compareEvents)
      .slice(0, 20);

    const responsibilities = state.responsibilities
      .filter((resp) => {
        const event = state.events.find((row) => row.id === resp.event_id);
        if (!event || event.deleted_at !== null) return false;
        if (!viewer && (!event.is_public || !resp.public_visibility)) return false;
        return [resp.title, resp.note, resp.assigned_team].join(' ').toLowerCase().includes(q);
      })
      .slice(0, 20)
      .map((resp) => {
        const event = state.events.find((row) => row.id === resp.event_id) as EventRow;
        return {
          id: resp.id,
          title: resp.title,
          assigned_team: resp.assigned_team,
          note: resp.note,
          status: resp.status,
          due_at: resp.due_at,
          event_id: event.id,
          event_title: event.title,
          event_date: event.event_date,
        };
      });

    return {
      query: raw,
      events: events.map((row) => serializeEvent(row, viewer)),
      responsibilities,
      organizations: state.organizations.filter((org) => org.active && org.name.toLowerCase().includes(q)).slice(0, 10),
      // Private notes are only ever searched within the signed-in admin's own.
      notes: viewer
        ? state.quickNotes.filter(
            (note) => note.user_id === viewer.id && `${note.title} ${note.content}`.toLowerCase().includes(q)
          )
        : [],
    };
  }

  // --- events -------------------------------------------------------------
  if (segments[0] === 'events') {
    if (segments.length === 1 && method === 'GET') {
      const all = filterEvents(params, viewer);
      const limit = Math.min(200, Number(params.get('limit') ?? 100) || 100);
      const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
      const page = all.slice(offset, offset + limit);
      return {
        events: page.map((row) => serializeEvent(row, viewer)),
        page: { total: all.length, limit, offset, has_more: offset + page.length < all.length },
      };
    }

    if (segments.length === 1 && method === 'POST') return createEvent(body, requireAdmin());

    if (segments[1] === 'check-conflicts' && method === 'POST') {
      requireAdmin();
      const date = str(body, 'event_date');
      const location = str(body, 'location');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !location.trim()) return { conflicts: [] };
      return {
        conflicts: findVenueConflicts({
          id: num(body, 'id'),
          location,
          event_date: date,
          start_time: str(body, 'start_time') || null,
          end_time: str(body, 'end_time') || null,
          all_day: bool(body, 'all_day'),
        }),
      };
    }

    const id = Number(segments[1]);
    if (!Number.isInteger(id)) throw notFound();

    if (segments.length === 2 && method === 'GET') return eventDetail(id, viewer);
    if (segments.length === 2 && method === 'PATCH') return updateEvent(id, body, requireAdmin());

    if (segments.length === 2 && method === 'DELETE') {
      const admin = requireAdmin();
      const row = eventOr404(id, admin);
      row.deleted_at = now();
      logActivity('event.archived', id, { title: row.title });
      return { ok: true, archived: true };
    }

    if (segments[2] === 'restore' && method === 'POST') {
      const admin = requireAdmin();
      const row = eventOr404(id, admin);
      row.deleted_at = null;
      logActivity('event.restored', id, { title: row.title });
      return { event: serializeEvent(row, admin) };
    }

    if (segments[2] === 'duplicate' && method === 'POST') {
      const admin = requireAdmin();
      const source = eventOr404(id, admin);
      const newId = nextId('event');
      state.events.push({
        ...source,
        id: newId,
        title: `${source.title} (copy)`,
        event_date: str(body, 'event_date') || source.event_date,
        status: 'planning',
        created_by: admin.id,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
      });
      if (body.copy_responsibilities !== false) {
        for (const resp of state.responsibilities.filter((entry) => entry.event_id === id)) {
          state.responsibilities.push({
            ...resp,
            id: nextId('resp'),
            event_id: newId,
            status: 'not_started',
            completed_by: null,
            completed_at: null,
            created_by: admin.id,
            created_at: now(),
            updated_at: now(),
          });
        }
      }
      logActivity('event.duplicated', newId, { source_event_id: id, source_title: source.title });
      return { event: serializeEvent(state.events.find((row) => row.id === newId) as EventRow, admin) };
    }

    if (segments[2] === 'activity' && method === 'GET') {
      requireAdmin();
      return {
        activity: state.activity
          .filter((entry) => entry.event_id === id)
          .map((entry) => ({ ...entry, user_name: userName(entry.user_id) })),
      };
    }

    if (segments[2] === 'responsibilities' && method === 'POST') return addResponsibility(id, body, requireAdmin());

    if (segments[2] === 'notes' && method === 'POST') {
      const admin = requireAdmin();
      const content = str(body, 'content').trim();
      if (!content) throw new HttpError(400, 'bad_request', 'The note cannot be empty.');
      const note = {
        id: nextId('eventNote'),
        event_id: id,
        created_by: admin.id,
        content,
        created_at: now(),
        updated_at: now(),
      };
      state.eventNotes.push(note);
      logActivity('event_note.added', id, {});
      return { note: { ...note, author_name: admin.name } };
    }

    if (segments[2] === 'attachments' && method === 'POST') {
      const admin = requireAdmin();
      const file = formData?.get('file');
      if (!(file instanceof File)) throw new HttpError(400, 'bad_request', 'Please choose a file to upload.');
      const row = {
        id: nextId('attachment'),
        event_id: id,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        public_visibility: String(formData?.get('public_visibility')) === 'true',
        uploaded_by: admin.id,
        created_at: now(),
        object_url: URL.createObjectURL(file),
      };
      state.attachments.push(row);
      logActivity('attachment.added', id, { file_name: file.name });
      return { attachment: serializeAttachment(row) };
    }
  }

  // --- responsibilities ---------------------------------------------------
  if (segments[0] === 'responsibilities') {
    const admin = requireAdmin();
    const id = Number(segments[1]);
    const row = state.responsibilities.find((entry) => entry.id === id);
    if (!row) throw notFound('That responsibility no longer exists.');

    if (method === 'PATCH') {
      const wasComplete = row.status === 'completed';
      if (body.title !== undefined) row.title = str(body, 'title');
      if (body.assigned_team !== undefined) row.assigned_team = str(body, 'assigned_team');
      if (body.assigned_user_id !== undefined) row.assigned_user_id = num(body, 'assigned_user_id');
      if (body.note !== undefined) row.note = str(body, 'note');
      if (body.due_at !== undefined) row.due_at = str(body, 'due_at') || null;
      if (body.public_visibility !== undefined) row.public_visibility = bool(body, 'public_visibility');
      if (body.status !== undefined) row.status = str(body, 'status') as RespRow['status'];
      row.updated_at = now();

      const isComplete = row.status === 'completed';
      if (isComplete && !wasComplete) {
        row.completed_by = admin.id;
        row.completed_at = now();
        logActivity('responsibility.completed', row.event_id, { title: row.title, assigned_to: row.assigned_team || null });
      } else if (!isComplete && wasComplete) {
        row.completed_by = null;
        row.completed_at = null;
        logActivity('responsibility.reopened', row.event_id, { title: row.title });
      } else {
        logActivity('responsibility.updated', row.event_id, { title: row.title });
      }
      return { responsibility: serializeResponsibility(row, admin) };
    }

    if (method === 'DELETE') {
      state.responsibilities = state.responsibilities.filter((entry) => entry.id !== id);
      logActivity('responsibility.removed', row.event_id, { title: row.title });
      return { ok: true };
    }
  }

  // --- my tasks -----------------------------------------------------------
  if (path === '/tasks/mine') {
    const admin = requireAdmin();
    const includeCompleted = params.get('include_completed') === 'true';
    const tasks = state.responsibilities
      .filter((resp) => resp.assigned_user_id === admin.id)
      .filter((resp) => includeCompleted || resp.status !== 'completed')
      .filter((resp) => {
        const event = state.events.find((row) => row.id === resp.event_id);
        return event && event.deleted_at === null && event.status !== 'cancelled';
      })
      .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
      .map((resp) => {
        const event = state.events.find((row) => row.id === resp.event_id) as EventRow;
        return {
          ...serializeResponsibility(resp, admin),
          event: {
            id: event.id,
            title: event.title,
            event_date: event.event_date,
            start_time: event.start_time,
            status: event.status,
          },
        };
      });
    return { tasks };
  }

  // --- quick notes (private to their author) ------------------------------
  if (segments[0] === 'notes') {
    const admin = requireAdmin();
    const own = (id: number) => {
      const note = state.quickNotes.find((entry) => entry.id === id && entry.user_id === admin.id);
      if (!note) throw notFound('That note no longer exists.');
      return note;
    };

    if (segments.length === 1 && method === 'GET') {
      const search = (params.get('q') ?? '').trim().toLowerCase();
      const archived = params.get('archived') === 'true';
      return {
        notes: state.quickNotes
          .filter((note) => note.user_id === admin.id && note.archived === archived)
          .filter((note) => (search ? `${note.title} ${note.content}`.toLowerCase().includes(search) : true))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)),
      };
    }

    if (segments.length === 1 && method === 'POST') {
      const content = str(body, 'content');
      const note = {
        id: nextId('note'),
        user_id: admin.id,
        title: str(body, 'title') || deriveTitle(content),
        content,
        pinned: bool(body, 'pinned'),
        archived: false,
        created_at: now(),
        updated_at: now(),
      };
      state.quickNotes.push(note);
      return { note };
    }

    const id = Number(segments[1]);

    if (segments.length === 2 && method === 'PATCH') {
      const note = own(id);
      if (body.content !== undefined) note.content = str(body, 'content');
      note.title = body.title !== undefined ? str(body, 'title') || deriveTitle(note.content) : note.title || deriveTitle(note.content);
      if (body.pinned !== undefined) note.pinned = bool(body, 'pinned');
      if (body.archived !== undefined) note.archived = bool(body, 'archived');
      note.updated_at = now();
      return { note };
    }

    if (segments.length === 2 && method === 'DELETE') {
      own(id);
      state.quickNotes = state.quickNotes.filter((entry) => entry.id !== id);
      return { ok: true };
    }

    if (segments[2] === 'convert' && method === 'POST') {
      const note = own(id);
      const eventId = num(body, 'event_id');
      const event = state.events.find((row) => row.id === eventId && row.deleted_at === null);
      if (!event) throw notFound('That event no longer exists.');

      const created = addResponsibility(
        event.id,
        {
          title: str(body, 'title'),
          assigned_team: str(body, 'assigned_team'),
          assigned_user_id: num(body, 'assigned_user_id'),
          note: str(body, 'note') || note.content,
          due_at: str(body, 'due_at'),
          public_visibility: bool(body, 'public_visibility'),
          override_conflicts: true,
        },
        admin
      );
      if (bool(body, 'archive_note', true)) {
        note.archived = true;
        note.updated_at = now();
      }
      return { responsibility: created.responsibility, conflicts: [], note };
    }
  }

  // --- event notes and attachments ---------------------------------------
  if (segments[0] === 'event-notes') {
    const admin = requireAdmin();
    const id = Number(segments[1]);
    const note = state.eventNotes.find((entry) => entry.id === id);
    if (!note) throw notFound('That note no longer exists.');
    if (note.created_by !== admin.id && admin.role !== 'super_admin') {
      throw forbidden('Only the admin who wrote this note can change it.');
    }
    if (method === 'PATCH') {
      note.content = str(body, 'content');
      note.updated_at = now();
      return { note: { ...note, author_name: userName(note.created_by) } };
    }
    if (method === 'DELETE') {
      state.eventNotes = state.eventNotes.filter((entry) => entry.id !== id);
      logActivity('event_note.removed', note.event_id, {});
      return { ok: true };
    }
  }

  if (segments[0] === 'attachments') {
    const id = Number(segments[1]);
    const row = state.attachments.find((entry) => entry.id === id);
    if (!row) throw notFound('That file no longer exists.');
    const admin = requireAdmin();

    if (method === 'PATCH') {
      row.public_visibility = bool(body, 'public_visibility');
      logActivity('attachment.visibility_changed', row.event_id, {
        file_name: row.file_name,
        is_public: row.public_visibility,
      });
      return { attachment: serializeAttachment(row) };
    }
    if (method === 'DELETE') {
      state.attachments = state.attachments.filter((entry) => entry.id !== id);
      logActivity('attachment.removed', row.event_id, { file_name: row.file_name });
      void admin;
      return { ok: true };
    }
  }

  // --- administration -----------------------------------------------------
  if (path === '/admin/archive') {
    const admin = requireAdmin();
    return {
      events: state.events.filter((row) => row.deleted_at !== null).map((row) => serializeEvent(row, admin)),
    };
  }

  if (path === '/admin/activity') {
    requireAdmin();
    return {
      activity: state.activity.slice(0, 60).map((entry) => ({
        ...entry,
        user_name: userName(entry.user_id),
        event_title: state.events.find((row) => row.id === entry.event_id)?.title ?? null,
      })),
    };
  }

  if (path === '/admin/users') {
    requireSuper();
    if (method === 'GET') {
      return {
        users: state.users,
        staff_admin_slots: {
          used: state.users.filter((user) => user.role === 'staff_admin' && user.active).length,
          total: 2,
        },
      };
    }
    if (method === 'POST') {
      throw new HttpError(409, 'conflict', 'Both Staff Admin places are in use. Deactivate one before adding another.');
    }
  }

  if (segments[0] === 'admin' && segments[1] === 'users' && segments[2]) {
    requireSuper();
    const id = Number(segments[2]);
    const user = state.users.find((entry) => entry.id === id);
    if (!user) throw notFound('That administrator no longer exists.');
    if (user.role === 'super_admin') throw forbidden('The Super Admin account cannot be changed here.');

    if (method === 'DELETE') {
      user.active = false;
      logActivity('admin.staff_deactivated', null, { email: user.email });
      return { ok: true };
    }
    if (method === 'PATCH') {
      if (body.active !== undefined) user.active = bool(body, 'active');
      logActivity('admin.staff_updated', null, { email: user.email, active: user.active });
      return { user };
    }
  }

  if (segments[0] === 'meta' && (segments[1] === 'organizations' || segments[1] === 'venues')) {
    requireSuper();
    throw new HttpError(403, 'forbidden', 'Organiser and venue changes are disabled in the demo.');
  }

  if (path === '/health') return { ok: true, service: 'infin8-calendar-demo' };

  throw notFound(`No API route matches ${method} ${path}.`);
}

/** Replaces window.fetch for /api requests only. */
export function installMockApi(): void {
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith('/api')) return realFetch(input as RequestInfo, init);

    const method = (init?.method ?? 'GET').toUpperCase();
    const [rawPath, rawQuery] = url.slice(4).split('?');
    const params = new URLSearchParams(rawQuery ?? '');

    let body: Body = {};
    let formData: FormData | null = null;
    if (init?.body instanceof FormData) formData = init.body;
    else if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body) as Body;
      } catch {
        body = {};
      }
    }

    // A touch of latency so loading and refreshing states are visible.
    await new Promise((resolve) => setTimeout(resolve, 90));

    try {
      const payload = handle(method, rawPath, params, body, formData);
      return new Response(JSON.stringify(payload), {
        status: method === 'POST' && payload && typeof payload === 'object' && 'event' in payload ? 201 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      const failure =
        error instanceof HttpError
          ? error
          : new HttpError(500, 'server_error', 'Something went wrong in the demo. Please reload the page.');
      if (!(error instanceof HttpError)) console.error('[demo]', error);
      return new Response(
        JSON.stringify({ error: { code: failure.code, message: failure.message, details: failure.details } }),
        { status: failure.status, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}
