/**
 * In-memory stand-in for the Calendar API, used only by the browser demo.
 * The rules here mirror server/src/lib (readiness, conflicts, public vs admin
 * output) so the demo behaves like the real thing; it is not the server.
 */
import type {
  Attachment,
  CalendarEvent,
  EventStatus,
  EventType,
  Readiness,
  Responsibility,
  ResponsibilityStatus,
  SourceType,
  Viewer,
} from '../src/api/types';
import { addDays, todayISO } from '../src/lib/date';
import { EVENTS, ORGANIZATIONS, QUICK_NOTES, USERS, VENUES } from './data';

export interface OrgRow {
  id: number;
  name: string;
  slug: string;
  type: SourceType;
  active: boolean;
  sort_order: number;
}
export interface VenueRow {
  id: number;
  name: string;
  active: boolean;
}
export interface EventRow {
  id: number;
  title: string;
  description: string;
  event_type: EventType;
  organizer_id: number | null;
  organizer_name: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string;
  status: EventStatus;
  important: boolean;
  is_public: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface RespRow {
  id: number;
  event_id: number;
  title: string;
  assigned_user_id: number | null;
  assigned_team: string;
  note: string;
  due_at: string | null;
  status: ResponsibilityStatus;
  public_visibility: boolean;
  position: number;
  completed_by: number | null;
  completed_at: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}
export interface NoteRow {
  id: number;
  user_id: number;
  title: string;
  content: string;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface EventNoteRow {
  id: number;
  event_id: number;
  created_by: number | null;
  content: string;
  created_at: string;
  updated_at: string;
}
export interface AttachmentRow {
  id: number;
  event_id: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  public_visibility: boolean;
  uploaded_by: number | null;
  created_at: string;
  object_url: string;
}
export interface ActivityRow {
  id: number;
  event_id: number | null;
  user_id: number | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface State {
  organizations: OrgRow[];
  venues: VenueRow[];
  events: EventRow[];
  responsibilities: RespRow[];
  quickNotes: NoteRow[];
  eventNotes: EventNoteRow[];
  attachments: AttachmentRow[];
  activity: ActivityRow[];
  users: Array<{ id: number; name: string; email: string; role: Viewer['role']; active: boolean; created_at: string }>;
  viewer: Viewer | null;
  seq: Record<string, number>;
}

function stamp(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString().replace('T', ' ').slice(0, 19);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/&/g, '-and-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export const state: State = buildInitialState();

function buildInitialState(): State {
  const today = todayISO();
  const seq: Record<string, number> = {
    org: 0,
    venue: 0,
    event: 0,
    resp: 0,
    note: 0,
    eventNote: 0,
    attachment: 0,
    activity: 0,
  };
  const next = (key: string) => (seq[key] += 1);

  const organizations: OrgRow[] = ORGANIZATIONS.map((org) => ({
    id: next('org'),
    name: org.name,
    slug: slugify(org.name),
    type: org.type,
    active: true,
    sort_order: org.sort,
  }));

  const venues: VenueRow[] = VENUES.map((name) => ({ id: next('venue'), name, active: true }));

  const events: EventRow[] = [];
  const responsibilities: RespRow[] = [];
  const eventNotes: EventNoteRow[] = [];
  const activity: ActivityRow[] = [];

  for (const seed of EVENTS) {
    const organizer = organizations.find((org) => org.name === seed.organizer) ?? null;
    const id = next('event');
    const allDay = seed.allDay === true;

    events.push({
      id,
      title: seed.title,
      description: seed.description ?? '',
      event_type: seed.type,
      organizer_id: organizer?.id ?? null,
      organizer_name: seed.organizer,
      event_date: addDays(today, seed.offsetDays),
      start_time: allDay ? null : seed.start ?? null,
      end_time: allDay ? null : seed.end ?? null,
      all_day: allDay,
      location: seed.location,
      status: seed.status ?? 'planning',
      important: seed.important === true,
      is_public: seed.isPublic !== false,
      created_by: 1,
      created_at: stamp(-120),
      updated_at: stamp(-120),
      deleted_at: null,
    });

    activity.push({
      id: next('activity'),
      event_id: id,
      user_id: 1,
      action: 'event.created',
      metadata: { title: seed.title },
      created_at: stamp(-120),
    });

    (seed.responsibilities ?? []).forEach((resp, index) => {
      const status = resp.status ?? 'not_started';
      const done = status === 'completed';
      responsibilities.push({
        id: next('resp'),
        event_id: id,
        title: resp.title,
        assigned_user_id: resp.assignTo ?? null,
        assigned_team: resp.team,
        note: resp.note ?? '',
        due_at:
          resp.dueOffsetDays === undefined
            ? null
            : `${addDays(today, resp.dueOffsetDays)} ${resp.dueTime ?? '18:00'}`,
        status,
        public_visibility: resp.isPublic === true,
        position: index,
        completed_by: done ? 1 : null,
        completed_at: done ? stamp(-110) : null,
        created_by: 1,
        created_at: stamp(-120),
        updated_at: stamp(-115),
      });
      if (done) {
        activity.push({
          id: next('activity'),
          event_id: id,
          user_id: 1,
          action: 'responsibility.completed',
          metadata: { title: resp.title, assigned_to: resp.team || null },
          created_at: stamp(-110),
        });
      }
    });

    for (const note of seed.notes ?? []) {
      eventNotes.push({
        id: next('eventNote'),
        event_id: id,
        created_by: 1,
        content: note,
        created_at: stamp(-100),
        updated_at: stamp(-100),
      });
    }
  }

  const quickNotes: NoteRow[] = QUICK_NOTES.map((note) => ({
    id: next('note'),
    user_id: note.userId,
    title: note.title,
    content: note.content,
    pinned: note.pinned,
    archived: false,
    created_at: stamp(-90),
    updated_at: stamp(-90),
  }));

  return {
    organizations,
    venues,
    events,
    responsibilities,
    quickNotes,
    eventNotes,
    attachments: [],
    activity,
    users: USERS.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: true,
      created_at: stamp(-1000),
    })),
    viewer: null,
    seq,
  };
}

export const nextId = (key: string): number => (state.seq[key] += 1);
export const now = stamp;

// --- rules mirrored from the server ---------------------------------------

const MINUTES_PER_DAY = 24 * 60;

export function minutesFromTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function eventMinuteRange(event: {
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
}): [number, number] {
  if (event.all_day || !event.start_time) return [0, MINUTES_PER_DAY];
  const start = minutesFromTime(event.start_time);
  const end = event.end_time ? minutesFromTime(event.end_time) : Math.min(start + 60, MINUTES_PER_DAY);
  return [start, Math.max(end, start + 1)];
}

const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

export function buildReadiness(total: number, completed: number): Readiness | null {
  if (total <= 0) return null;
  const percent = Math.round((completed / total) * 100);
  return {
    total,
    completed,
    percent,
    label: percent >= 90 ? 'ready' : percent >= 50 ? 'in_progress' : 'needs_attention',
  };
}

export function userName(id: number | null): string | null {
  return state.users.find((user) => user.id === id)?.name ?? null;
}

export function serializeEvent(row: EventRow, viewer: Viewer | null): CalendarEvent {
  const org = state.organizations.find((organization) => organization.id === row.organizer_id) ?? null;
  const resp = state.responsibilities.filter((entry) => entry.event_id === row.id);
  const attachments = state.attachments.filter((entry) => entry.event_id === row.id);

  const base: CalendarEvent = {
    id: row.id,
    title: row.title,
    description: row.description,
    event_type: row.event_type,
    is_deadline: row.event_type === 'deadline',
    organizer: org ? { id: org.id, name: org.name, type: org.type } : null,
    organizer_name: org?.name ?? row.organizer_name,
    source: org?.type ?? 'other',
    event_date: row.event_date,
    start_time: row.all_day ? null : row.start_time,
    end_time: row.all_day ? null : row.end_time,
    all_day: row.all_day,
    location: row.location,
    status: row.status,
    important: row.important,
    readiness: buildReadiness(resp.length, resp.filter((entry) => entry.status === 'completed').length),
    public_responsibility_count: resp.filter((entry) => entry.public_visibility).length,
    attachment_count: viewer
      ? attachments.length
      : attachments.filter((entry) => entry.public_visibility).length,
  };

  if (!viewer) return base;

  return {
    ...base,
    is_public: row.is_public,
    repeat_rule: 'none',
    repeat_interval: 1,
    repeat_until: null,
    parent_event_id: null,
    note_count: state.eventNotes.filter((entry) => entry.event_id === row.id).length,
    created_by: row.created_by,
    created_by_name: userName(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived: row.deleted_at !== null,
  };
}

export function serializeResponsibility(row: RespRow, viewer: Viewer | null): Responsibility {
  const assigneeName = userName(row.assigned_user_id);
  const assignedTo = row.assigned_team || assigneeName || 'Unassigned';

  if (!viewer) {
    return {
      id: row.id,
      event_id: row.event_id,
      title: row.title,
      assigned_to: assignedTo,
      status: row.status,
      public_visibility: true,
      note: row.note,
      due_at: row.due_at,
    };
  }

  return {
    id: row.id,
    event_id: row.event_id,
    title: row.title,
    assigned_to: assignedTo,
    assigned_user_id: row.assigned_user_id,
    assigned_user_name: assigneeName,
    assigned_team: row.assigned_team,
    note: row.note,
    due_at: row.due_at,
    status: row.status,
    public_visibility: row.public_visibility,
    position: row.position,
    completed_by: row.completed_by,
    completed_by_name: userName(row.completed_by),
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function serializeAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    event_id: row.event_id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    public_visibility: row.public_visibility,
    uploaded_by_name: userName(row.uploaded_by),
    created_at: row.created_at,
    // A real deployment streams this from the server; in the demo the file
    // never leaves the browser, so it is served from an object URL.
    download_url: row.object_url,
  };
}

export function findVenueConflicts(candidate: {
  id?: number | null;
  location: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
}) {
  const location = candidate.location.trim().toLowerCase();
  if (!location) return [];

  const [start, end] = eventMinuteRange(candidate);

  return state.events
    .filter(
      (row) =>
        row.deleted_at === null &&
        row.status !== 'cancelled' &&
        row.event_date === candidate.event_date &&
        row.location.trim().toLowerCase() === location &&
        row.id !== candidate.id
    )
    .filter((row) => {
      const [s, e] = eventMinuteRange(row);
      return overlaps(start, end, s, e);
    })
    .map((row) => ({
      kind: 'venue' as const,
      event_id: row.id,
      title: row.title,
      location: row.location,
      event_date: row.event_date,
      start_time: row.start_time,
      end_time: row.end_time,
      all_day: row.all_day,
    }));
}

export function findTeamConflicts(team: string, eventId: number, responsibilityId?: number | null) {
  const name = team.trim().toLowerCase();
  if (!name) return [];

  const target = state.events.find((row) => row.id === eventId && row.deleted_at === null);
  if (!target) return [];
  const [start, end] = eventMinuteRange(target);

  return state.responsibilities
    .filter((resp) => {
      if (resp.assigned_team.trim().toLowerCase() !== name) return false;
      if (resp.status === 'completed') return false;
      if (resp.event_id === eventId) return false;
      if (responsibilityId && resp.id === responsibilityId) return false;
      const event = state.events.find((row) => row.id === resp.event_id);
      if (!event || event.deleted_at !== null || event.status === 'cancelled') return false;
      if (event.event_date !== target.event_date) return false;
      const [s, e] = eventMinuteRange(event);
      return overlaps(start, end, s, e);
    })
    .map((resp) => {
      const event = state.events.find((row) => row.id === resp.event_id) as EventRow;
      return {
        kind: 'team' as const,
        team: resp.assigned_team,
        event_id: event.id,
        event_title: event.title,
        responsibility_title: resp.title,
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
      };
    });
}

export function to12Hour(time: string): string {
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minuteText} ${suffix}`;
}

export function logActivity(
  action: string,
  eventId: number | null,
  metadata: Record<string, unknown> = {}
): void {
  state.activity.unshift({
    id: nextId('activity'),
    event_id: eventId,
    user_id: state.viewer?.id ?? null,
    action,
    metadata,
    created_at: now(),
  });
}

/** Chronological ordering used by every list, matching the server. */
export function compareEvents(a: EventRow, b: EventRow): number {
  if (a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1;
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  const at = a.start_time ?? '99:99';
  const bt = b.start_time ?? '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id - b.id;
}
