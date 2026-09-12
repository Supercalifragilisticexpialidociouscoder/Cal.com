import { getDb } from '../db';
import { minutesFromTime, rangesOverlap } from './dates';
import { emptyCounts, type EventCounts } from './serialize';
import type { EventRow, OrganizationRow } from './types';

const MINUTES_PER_DAY = 24 * 60;

/**
 * The minute range an event occupies on its date, used for conflict checks.
 * All day events - and events with no times at all - span the whole day.
 */
export function eventMinuteRange(event: {
  all_day: number | boolean;
  start_time: string | null;
  end_time: string | null;
}): [number, number] {
  const allDay = event.all_day === 1 || event.all_day === true;
  if (allDay) return [0, MINUTES_PER_DAY];
  if (!event.start_time) return [0, MINUTES_PER_DAY];
  const start = minutesFromTime(event.start_time);
  const end = event.end_time
    ? minutesFromTime(event.end_time)
    : Math.min(start + 60, MINUTES_PER_DAY);
  return [start, Math.max(end, start + 1)];
}

export function loadOrganizationMap(): Map<number, OrganizationRow> {
  const rows = getDb().prepare('SELECT * FROM organizations').all() as OrganizationRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Aggregate counts for a batch of events in three grouped queries rather than
 * one query per event (spec 36 - efficient database access).
 */
export function loadEventCounts(eventIds: number[]): Map<number, EventCounts> {
  const result = new Map<number, EventCounts>();
  if (eventIds.length === 0) return result;

  const db = getDb();
  const placeholders = eventIds.map(() => '?').join(',');
  const ensure = (id: number): EventCounts => {
    let entry = result.get(id);
    if (!entry) {
      entry = { ...emptyCounts };
      result.set(id, entry);
    }
    return entry;
  };
  for (const id of eventIds) ensure(id);

  const responsibilityRows = db
    .prepare(
      `SELECT event_id,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN public_visibility = 1 THEN 1 ELSE 0 END) AS public_total,
              SUM(CASE WHEN public_visibility = 1 AND status = 'completed' THEN 1 ELSE 0 END) AS public_completed
         FROM responsibilities
        WHERE event_id IN (${placeholders})
        GROUP BY event_id`
    )
    .all(...eventIds) as Array<{
    event_id: number;
    total: number;
    completed: number;
    public_total: number;
    public_completed: number;
  }>;

  for (const row of responsibilityRows) {
    const entry = ensure(row.event_id);
    entry.responsibility_total = row.total ?? 0;
    entry.responsibility_completed = row.completed ?? 0;
    entry.public_responsibility_total = row.public_total ?? 0;
    entry.public_responsibility_completed = row.public_completed ?? 0;
  }

  const attachmentRows = db
    .prepare(
      `SELECT event_id,
              COUNT(*) AS total,
              SUM(CASE WHEN public_visibility = 1 THEN 1 ELSE 0 END) AS public_total
         FROM attachments
        WHERE event_id IN (${placeholders})
        GROUP BY event_id`
    )
    .all(...eventIds) as Array<{ event_id: number; total: number; public_total: number }>;

  for (const row of attachmentRows) {
    const entry = ensure(row.event_id);
    entry.attachment_total = row.total ?? 0;
    entry.public_attachment_total = row.public_total ?? 0;
  }

  const noteRows = db
    .prepare(
      `SELECT event_id, COUNT(*) AS total
         FROM event_notes
        WHERE event_id IN (${placeholders})
        GROUP BY event_id`
    )
    .all(...eventIds) as Array<{ event_id: number; total: number }>;

  for (const row of noteRows) {
    ensure(row.event_id).note_total = row.total ?? 0;
  }

  return result;
}

export interface VenueConflict {
  kind: 'venue';
  event_id: number;
  title: string;
  location: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
}

export interface TeamConflict {
  kind: 'team';
  team: string;
  event_id: number;
  event_title: string;
  responsibility_title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
}

/**
 * Warns when a venue is already in use at an overlapping time (spec 23).
 * Cancelled events never block, and the caller may always override.
 */
export function findVenueConflicts(candidate: {
  id?: number | null;
  location: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
}): VenueConflict[] {
  const location = candidate.location.trim();
  if (!location) return [];

  const rows = getDb()
    .prepare(
      `SELECT id, title, location, event_date, start_time, end_time, all_day
         FROM events
        WHERE deleted_at IS NULL
          AND status <> 'cancelled'
          AND event_date = ?
          AND location = ? COLLATE NOCASE
          AND (? IS NULL OR id <> ?)
        ORDER BY start_time IS NULL, start_time
        LIMIT 20`
    )
    .all(candidate.event_date, location, candidate.id ?? null, candidate.id ?? null) as Array<
    Pick<EventRow, 'id' | 'title' | 'location' | 'event_date' | 'start_time' | 'end_time' | 'all_day'>
  >;

  const [candidateStart, candidateEnd] = eventMinuteRange({
    all_day: candidate.all_day,
    start_time: candidate.start_time,
    end_time: candidate.end_time,
  });

  return rows
    .filter((row) => {
      const [start, end] = eventMinuteRange(row);
      return rangesOverlap(candidateStart, candidateEnd, start, end);
    })
    .map((row) => ({
      kind: 'venue' as const,
      event_id: row.id,
      title: row.title,
      location: row.location,
      event_date: row.event_date,
      start_time: row.start_time,
      end_time: row.end_time,
      all_day: row.all_day === 1,
    }));
}

/**
 * Warns when a team is already responsible for something else at the same
 * time (spec 24). Completed work never blocks.
 */
export function findTeamConflicts(candidate: {
  team: string;
  eventId: number;
  responsibilityId?: number | null;
}): TeamConflict[] {
  const team = candidate.team.trim();
  if (!team) return [];

  const db = getDb();
  const target = db
    .prepare(
      `SELECT id, event_date, start_time, end_time, all_day
         FROM events
        WHERE id = ? AND deleted_at IS NULL`
    )
    .get(candidate.eventId) as
    | Pick<EventRow, 'id' | 'event_date' | 'start_time' | 'end_time' | 'all_day'>
    | undefined;

  if (!target) return [];

  const [targetStart, targetEnd] = eventMinuteRange(target);

  const rows = db
    .prepare(
      `SELECT r.id AS responsibility_id,
              r.title AS responsibility_title,
              e.id AS event_id,
              e.title AS event_title,
              e.event_date,
              e.start_time,
              e.end_time,
              e.all_day
         FROM responsibilities r
         JOIN events e ON e.id = r.event_id
        WHERE r.assigned_team = ? COLLATE NOCASE
          AND r.status <> 'completed'
          AND e.deleted_at IS NULL
          AND e.status <> 'cancelled'
          AND e.event_date = ?
          AND e.id <> ?
          AND (? IS NULL OR r.id <> ?)
        LIMIT 20`
    )
    .all(
      team,
      target.event_date,
      candidate.eventId,
      candidate.responsibilityId ?? null,
      candidate.responsibilityId ?? null
    ) as Array<{
    responsibility_id: number;
    responsibility_title: string;
    event_id: number;
    event_title: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    all_day: number;
  }>;

  return rows
    .filter((row) => {
      const [start, end] = eventMinuteRange(row);
      return rangesOverlap(targetStart, targetEnd, start, end);
    })
    .map((row) => ({
      kind: 'team' as const,
      team,
      event_id: row.event_id,
      event_title: row.event_title,
      responsibility_title: row.responsibility_title,
      event_date: row.event_date,
      start_time: row.start_time,
      end_time: row.end_time,
    }));
}

export function describeVenueConflict(conflict: VenueConflict): string {
  const when = conflict.all_day
    ? 'all day'
    : conflict.start_time && conflict.end_time
      ? `from ${to12Hour(conflict.start_time)} to ${to12Hour(conflict.end_time)}`
      : conflict.start_time
        ? `at ${to12Hour(conflict.start_time)}`
        : 'at an overlapping time';
  return `${conflict.location} is already booked ${when} for "${conflict.title}".`;
}

export function to12Hour(time: string): string {
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minuteText} ${suffix}`;
}
