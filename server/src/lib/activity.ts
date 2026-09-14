import { getDb } from '../db';
import type { Viewer } from './types';

export interface ActivityEntry {
  id: number;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  user_name: string | null;
  user_id: number | null;
}

/**
 * Lightweight accountability trail (spec 25). Never surfaced to public users.
 */
export function logActivity(
  action: string,
  options: { eventId?: number | null; viewer?: Viewer | null; metadata?: Record<string, unknown> } = {}
): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO activity_log (event_id, user_id, action, metadata) VALUES (?, ?, ?, ?)`
      )
      .run(
        options.eventId ?? null,
        options.viewer?.id ?? null,
        action,
        JSON.stringify(options.metadata ?? {})
      );
  } catch {
    // Activity logging must never break the operation it describes.
  }
}

export function listEventActivity(eventId: number, limit = 50): ActivityEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id, a.action, a.metadata, a.created_at, a.user_id, u.name AS user_name
         FROM activity_log a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.event_id = ?
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ?`
    )
    .all(eventId, limit) as Array<{
    id: number;
    action: string;
    metadata: string;
    created_at: string;
    user_id: number | null;
    user_name: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    created_at: row.created_at,
    user_id: row.user_id,
    user_name: row.user_name,
    metadata: safeParse(row.metadata),
  }));
}

function safeParse(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
