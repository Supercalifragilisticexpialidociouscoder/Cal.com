import { getDb } from '../db';
import { loadEventCounts, loadOrganizationMap } from './events';
import { serializeEvent, type SerializedEvent } from './serialize';
import type { EventRow, Viewer } from './types';

/**
 * Turns event rows into API payloads with their organiser, readiness counts and
 * (for admins) creator names resolved in a fixed number of queries.
 */
export function presentEvents(rows: EventRow[], viewer: Viewer | null): SerializedEvent[] {
  if (rows.length === 0) return [];

  const organizations = loadOrganizationMap();
  const counts = loadEventCounts(rows.map((row) => row.id));

  let creatorNames = new Map<number, string>();
  if (viewer) {
    const creatorIds = [...new Set(rows.map((row) => row.created_by).filter((id): id is number => id !== null))];
    if (creatorIds.length > 0) {
      const placeholders = creatorIds.map(() => '?').join(',');
      const users = getDb()
        .prepare(`SELECT id, name FROM users WHERE id IN (${placeholders})`)
        .all(...creatorIds) as Array<{ id: number; name: string }>;
      creatorNames = new Map(users.map((user) => [user.id, user.name]));
    }
  }

  return rows.map((row) =>
    serializeEvent(row, viewer, {
      organization: row.organizer_id ? organizations.get(row.organizer_id) ?? null : null,
      counts: counts.get(row.id),
      creatorName: row.created_by ? creatorNames.get(row.created_by) ?? null : null,
    })
  );
}

export function presentEvent(row: EventRow, viewer: Viewer | null): SerializedEvent {
  return presentEvents([row], viewer)[0];
}

/** Chronological ordering used consistently across every list in the product. */
export const EVENT_ORDER_BY = `event_date ASC, all_day DESC, start_time IS NULL, start_time ASC, id ASC`;

export interface EventFilters {
  from?: string;
  to?: string;
  q?: string;
  source?: string;
  organizerId?: number;
  eventType?: string;
  status?: string;
  important?: boolean;
  deadlinesOnly?: boolean;
  includeArchived?: boolean;
}

/**
 * Builds the WHERE clause shared by the calendar, event list and search.
 * Public callers (viewer === null) can only ever reach public, live events.
 */
export function buildEventWhere(
  filters: EventFilters,
  viewer: Viewer | null
): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (viewer && filters.includeArchived) {
    // Admins may explicitly ask for the archive.
  } else {
    conditions.push('e.deleted_at IS NULL');
  }

  if (!viewer) {
    conditions.push('e.is_public = 1');
  }

  if (filters.from) {
    conditions.push('e.event_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push('e.event_date <= ?');
    params.push(filters.to);
  }
  if (filters.eventType) {
    conditions.push('e.event_type = ?');
    params.push(filters.eventType);
  }
  if (filters.deadlinesOnly) {
    conditions.push(`e.event_type = 'deadline'`);
  }
  if (filters.status) {
    conditions.push('e.status = ?');
    params.push(filters.status);
  }
  if (filters.important) {
    conditions.push('e.important = 1');
  }
  if (filters.organizerId) {
    conditions.push('e.organizer_id = ?');
    params.push(filters.organizerId);
  }
  if (filters.source) {
    conditions.push(
      `(o.type = ? OR (e.organizer_id IS NULL AND ? = 'other'))`
    );
    params.push(filters.source, filters.source);
  }
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      `(e.title LIKE ? OR e.description LIKE ? OR e.location LIKE ? OR e.organizer_name LIKE ? OR o.name LIKE ?)`
    );
    params.push(like, like, like, like, like);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export const EVENT_BASE_SELECT = `
  SELECT e.*
    FROM events e
    LEFT JOIN organizations o ON o.id = e.organizer_id
`;
