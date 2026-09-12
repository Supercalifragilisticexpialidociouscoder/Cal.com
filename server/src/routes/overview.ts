import { Router } from 'express';
import { getDb } from '../db';
import { addDays, todayISO } from '../lib/dates';
import { EVENT_ORDER_BY, presentEvents } from '../lib/eventPresenter';
import { buildReadiness } from '../lib/serialize';
import { serializeResponsibility } from '../lib/serialize';
import type { EventRow, ResponsibilityRow, Viewer } from '../lib/types';
import { asyncRoute } from '../middleware/error';

export const overviewRouter = Router();

const UPCOMING_LIMIT = 8;
const DEADLINE_LIMIT = 6;
const UPCOMING_HORIZON_DAYS = 120;

/**
 * GET /api/overview - the whole landing page in a single request.
 *
 * One round trip means a student sees today's events immediately (spec 36).
 * Administrators get their dashboard numbers in the same response.
 */
overviewRouter.get(
  '/',
  asyncRoute((req, res) => {
    const viewer: Viewer | null = req.viewer;
    const db = getDb();
    const today = todayISO();
    const horizon = addDays(today, UPCOMING_HORIZON_DAYS);
    const visibility = viewer ? '' : 'AND e.is_public = 1';

    const todayRows = db
      .prepare(
        `SELECT e.* FROM events e
          WHERE e.deleted_at IS NULL ${visibility} AND e.event_date = ?
          ORDER BY ${EVENT_ORDER_BY}`
      )
      .all(today) as EventRow[];

    const upcomingRows = db
      .prepare(
        `SELECT e.* FROM events e
          WHERE e.deleted_at IS NULL ${visibility}
            AND e.event_date > ? AND e.event_date <= ?
            AND e.status <> 'cancelled'
            AND e.event_type <> 'deadline'
          ORDER BY ${EVENT_ORDER_BY}
          LIMIT ?`
      )
      .all(today, horizon, UPCOMING_LIMIT) as EventRow[];

    // Deadlines are listed apart so they do not get lost (spec 4).
    const deadlineRows = db
      .prepare(
        `SELECT e.* FROM events e
          WHERE e.deleted_at IS NULL ${visibility}
            AND e.event_type = 'deadline'
            AND e.event_date >= ?
            AND e.status <> 'cancelled'
          ORDER BY ${EVENT_ORDER_BY}
          LIMIT ?`
      )
      .all(today, DEADLINE_LIMIT) as EventRow[];

    const importantRows = db
      .prepare(
        `SELECT e.* FROM events e
          WHERE e.deleted_at IS NULL ${visibility}
            AND e.important = 1
            AND e.event_date >= ?
            AND e.status <> 'cancelled'
          ORDER BY ${EVENT_ORDER_BY}
          LIMIT 5`
      )
      .all(today) as EventRow[];

    const payload: Record<string, unknown> = {
      today: today,
      today_events: presentEvents(todayRows, viewer),
      upcoming_events: presentEvents(upcomingRows, viewer),
      deadlines: presentEvents(deadlineRows, viewer),
      important_events: presentEvents(importantRows, viewer),
    };

    if (viewer) {
      res.setHeader('Cache-Control', 'no-store');
      payload.admin = buildAdminSummary(viewer, today);
    } else {
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    }

    res.json(payload);
  })
);

function buildAdminSummary(viewer: Viewer, today: string) {
  const db = getDb();

  const myTaskRows = db
    .prepare(
      `SELECT r.*, e.title AS event_title, e.event_date AS event_date
         FROM responsibilities r
         JOIN events e ON e.id = r.event_id
        WHERE e.deleted_at IS NULL
          AND e.status <> 'cancelled'
          AND r.status <> 'completed'
          AND r.assigned_user_id = ?
        ORDER BY (r.due_at IS NULL), r.due_at ASC, e.event_date ASC
        LIMIT 8`
    )
    .all(viewer.id) as Array<ResponsibilityRow & { event_title: string; event_date: string }>;

  const pendingToday = (
    db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM responsibilities r JOIN events e ON e.id = r.event_id
          WHERE e.deleted_at IS NULL AND e.event_date = ? AND r.status <> 'completed'`
      )
      .get(today) as { count: number }
  ).count;

  const eventsToday = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM events WHERE deleted_at IS NULL AND event_date = ?`)
      .get(today) as { count: number }
  ).count;

  const deadlinesSoon = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM events
          WHERE deleted_at IS NULL AND event_type = 'deadline'
            AND event_date >= ? AND event_date <= ? AND status <> 'cancelled'`
      )
      .get(today, addDays(today, 14)) as { count: number }
  ).count;

  const myOpenTasks = (
    db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM responsibilities r JOIN events e ON e.id = r.event_id
          WHERE e.deleted_at IS NULL AND r.status <> 'completed'
            AND r.assigned_user_id = ?`
      )
      .get(viewer.id) as { count: number }
  ).count;

  // Events in the next fortnight that still have open responsibilities, worst
  // prepared first - the "needs attention" list (spec 27).
  const readinessRows = db
    .prepare(
      `SELECT e.id, e.title, e.event_date,
              COUNT(r.id) AS total,
              SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed
         FROM events e
         JOIN responsibilities r ON r.event_id = e.id
        WHERE e.deleted_at IS NULL
          AND e.status NOT IN ('completed', 'cancelled')
          AND e.event_date >= ?
        GROUP BY e.id
        HAVING total > 0
        ORDER BY (CAST(completed AS REAL) / total) ASC, e.event_date ASC
        LIMIT 6`
    )
    .all(today) as Array<{
    id: number;
    title: string;
    event_date: string;
    total: number;
    completed: number;
  }>;

  return {
    stats: {
      events_today: eventsToday,
      my_open_tasks: myOpenTasks,
      pending_responsibilities_today: pendingToday,
      deadlines_next_14_days: deadlinesSoon,
    },
    my_tasks: myTaskRows.map((row) => ({
      ...serializeResponsibility(row, viewer),
      event: { id: row.event_id, title: row.event_title, event_date: row.event_date },
    })),
    readiness: readinessRows.map((row) => ({
      event_id: row.id,
      title: row.title,
      event_date: row.event_date,
      readiness: buildReadiness(row.total, row.completed),
    })),
  };
}
